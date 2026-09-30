/* Web adapter -- used only by the deployed (Netlify) build.
   app.js talks to three capabilities through window.claude.use(): "downloads", "db" and "mcp".
   Inside claude.ai those are provided by the viewer. On a normal website nothing provides them, so this file supplies
   the same three names, backed by:
     downloads -> a browser file download
     db        -> the Netlify functions (Netlify DB / Postgres for the index, Netlify Blobs for the PDF + JSON)
     mcp       -> Google Drive (Google Identity Services, browser-side) and email (Resend, via a Netlify function)
   If window.claude already exists (claude.ai), this file does nothing. */
(function () {
  "use strict";
  if (window.claude) return;

  const FN = "/.netlify/functions/";
  const KEY_NAME = "phoenix.accessKey";

  /* ---------- small helpers ---------- */
  const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* storage blocked */ } };
  const fail = (message, code) => { const e = new Error(message); if (code) e.code = code; return e; };

  /* ---------- access key prompt (the functions are locked with APP_ACCESS_KEY) ---------- */
  let keyAsk = null;
  function askForKey(reason) {
    if (keyAsk) return keyAsk;
    keyAsk = new Promise(resolve => {
      const css = document.createElement("style");
      css.textContent = ".pk-back{position:fixed;inset:0;background:rgba(36,27,30,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}" +
        ".pk-box{background:#fff;border-radius:10px;border-top:3px solid #9C4A63;max-width:360px;width:100%;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.45 Inter,system-ui,sans-serif;color:#241B1E}" +
        ".pk-box h2{margin:0 0 6px;font:600 16px 'Playfair Display',Georgia,serif}.pk-box p{margin:0 0 12px;color:#8B7680;font-size:13px}" +
        ".pk-box input{width:100%;padding:8px 10px;border:1px solid #E3CDD5;border-radius:6px;font:inherit;margin-bottom:12px}" +
        ".pk-row{display:flex;gap:8px;justify-content:flex-end}.pk-row button{padding:7px 14px;border-radius:6px;border:1px solid #E3CDD5;background:#fff;cursor:pointer;font:inherit}" +
        ".pk-row .go{background:#9C4A63;border-color:#9C4A63;color:#fff;font-weight:600}";
      const back = document.createElement("div"); back.className = "pk-back"; back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true"); back.setAttribute("aria-label", "Access key");
      const box = document.createElement("form"); box.className = "pk-box";
      const h2 = document.createElement("h2"); h2.textContent = "Access key needed";
      const p = document.createElement("p"); p.textContent = reason || "Enter the team access key to use saving, Drive and email.";
      const input = document.createElement("input"); input.type = "password"; input.autocomplete = "current-password"; input.placeholder = "Access key"; input.setAttribute("aria-label", "Access key");
      const row = document.createElement("div"); row.className = "pk-row";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
      const go = document.createElement("button"); go.type = "submit"; go.className = "go"; go.textContent = "Continue";
      row.append(cancel, go); box.append(h2, p, input, row); back.append(box);
      const done = v => { back.remove(); css.remove(); keyAsk = null; resolve(v); };
      box.addEventListener("submit", e => { e.preventDefault(); done(input.value.trim() || null); });
      cancel.addEventListener("click", () => done(null));
      back.addEventListener("keydown", e => { if (e.key === "Escape") done(null); });
      document.head.append(css); document.body.append(back); input.focus();
    });
    return keyAsk;
  }

  /* ---------- calling the Netlify functions ---------- */
  async function call(name, opts) {
    opts = opts || {};
    const url = FN + name + (opts.query ? "?" + new URLSearchParams(opts.query).toString() : "");
    const attempt = async () => {
      let res;
      try {
        res = await fetch(url, {
          method: opts.body ? "POST" : "GET",
          headers: Object.assign({ "x-access-key": lsGet(KEY_NAME) }, opts.body ? { "Content-Type": "application/json" } : {}),
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          cache: "no-store"
        });
      } catch (e) { throw fail("Can't reach the server. Check your internet connection and try again.", "network"); }
      const type = res.headers.get("content-type") || "";
      let data = null;
      if (type.includes("json")) { try { data = await res.json(); } catch (e) { /* fall through */ } }
      else if (res.status === 404) throw fail("Server features aren't set up on this site yet. Deploy it with Netlify (see DEPLOY.md).", "no_functions");
      return { res, data };
    };
    let r = await attempt();
    if (r.res.status === 401) {
      const key = await askForKey(lsGet(KEY_NAME) ? "That key was not accepted. Try again." : null);
      if (!key) throw fail("Cancelled -- an access key is needed for this action.", "cancelled");
      lsSet(KEY_NAME, key);
      r = await attempt();
      if (r.res.status === 401) { lsSet(KEY_NAME, ""); throw fail("That access key was not accepted.", "unauthorized"); }
    }
    if (!r.res.ok) throw fail((r.data && r.data.error) || ("The server answered " + r.res.status + "."), r.res.status === 409 ? "conflict" : "server");
    return r.data;
  }

  /* ---------- downloads ---------- */
  const downloads = {
    async save(req) {
      const d = req.data;
      const blob = d instanceof Blob ? d : new Blob([d]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = req.filename; a.style.display = "none";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    }
  };

  /* ---------- db: the quote archive ---------- */
  const asDoc = row => ({
    _id: String(row.id),
    jobNo: row.job_no || "", itemNo: row.item_no || "", stage: row.quote_stage || "", customer: row.customer || "", designer: row.designer || "",
    tier: row.tier || "", cur: row.currency || "", total: row.total == null ? 0 : Number(row.total),
    savedAt: Date.parse(row.created_at) || Date.now(), filenameBase: row.filename_base,
    _load: () => call("load-quote", { query: { filenameBase: row.filename_base } }) // the saved snapshot, already parsed
  });
  const wrapDoc = row => { const data = asDoc(row); return { id: data._id, exists: true, data: () => data }; };
  const db = {
    remote: true,
    wantsPdf: true,
    async searchQuotes(term) {
      const out = await call("search-quotes", { query: { q: term } });
      return (out.results || []).map(asDoc);
    },
    collection() {
      const q = { _n: 100,
        orderBy() { return q; },
        limit(n) { q._n = n; return q; },
        async get() { const out = await call("search-quotes", { query: { recent: "1", limit: String(q._n) } }); const docs = (out.results || []).map(wrapDoc); return { docs, size: docs.length, empty: !docs.length }; },
        // The server refuses a duplicate Job / Item / Stage itself (one atomic check), so there is nothing to look up first.
        doc(id) { return { id, async get() { return { id, exists: false, data: () => undefined }; }, async set(d) { await call("save-quote", { body: d }); } }; }
      };
      return q;
    }
  };

  /* ---------- mcp: Google Drive + email ---------- */
  let cfgP = null;
  // Cached once Drive is fully configured; until then it is re-read each time, so fixing the settings needs no page reload.
  const config = () => cfgP || (cfgP = call("app-config").then(c => { if (!(c.googleClientId && c.driveFolderId)) cfgP = null; return c; }, e => { cfgP = null; throw e; }));

  let gsiP = null;
  const loadGsi = () => gsiP || (gsiP = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gsiP = null; reject(fail("Couldn't load Google's sign-in library. Check your connection and try again.", "network")); };
    document.head.append(s);
  }));

  let token = null, tokenExp = 0, tokenClient = null, pending = null;
  async function driveToken(clientId, force) {
    if (token && !force && Date.now() < tokenExp - 60000) return token;
    await loadGsi();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject }; // the client below is created once, so its callbacks answer whichever request is current
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/drive.file", // only files this app creates
          callback: r => {
            const p = pending; pending = null;
            if (!p) return;
            if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; p.resolve(token); }
            else p.reject(fail("Drive authorization was cancelled or failed.", "cancelled"));
          },
          error_callback: () => { const p = pending; pending = null; if (p) p.reject(fail("Drive authorization was cancelled or failed.", "cancelled")); }
        });
      }
      tokenClient.requestAccessToken();
    });
  }
  async function driveUpload(input) {
    const cfg = await config();
    if (!cfg.googleClientId || !cfg.driveFolderId) throw fail("Google Drive isn't configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_DRIVE_FOLDER_ID on the site (see DEPLOY.md).", "not_configured");
    const send = async tok => {
      const boundary = "phoenix" + Math.random().toString(36).slice(2);
      const meta = { name: input.title, parents: [cfg.driveFolderId] };
      const body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n" +
        "--" + boundary + "\r\nContent-Type: " + input.contentMimeType + "\r\nContent-Transfer-Encoding: base64\r\n\r\n" + input.base64Content + "\r\n--" + boundary + "--";
      return fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "multipart/related; boundary=" + boundary }, body });
    };
    let res = await send(await driveToken(cfg.googleClientId, false));
    if (res.status === 401) res = await send(await driveToken(cfg.googleClientId, true)); // token expired: sign in again once
    if (!res.ok) { const t = await res.text(); throw fail("Drive upload failed (" + res.status + "): " + t.slice(0, 200), "server"); }
    return res.json();
  }
  async function sendEmail(input) {
    const att = (input.attachments || [])[0];
    if (!att) throw fail("Nothing to attach.", "bad_request");
    return call("send-quote-email", { body: { to: (input.to || [])[0], subject: input.subject, message: input.body, html: input.htmlBody, filenameBase: String(att.filename || "quote").replace(/\.pdf$/i, ""), pdfBase64: att.content } });
  }
  const mcp = {
    async callTool(server, tool, input) {
      if (server === "Google Drive" && tool === "create_file") return { payload: await driveUpload(input) };
      if (server === "Gmail" && tool === "send_message") return { payload: await sendEmail(input) };
      throw fail(server + " isn't available on this site.", "server_not_connected");
    }
  };

  const caps = { downloads, db, mcp };
  window.claude = { web: true, use: async name => caps[name] || null }; // web:true lets app.js word its hints for the website
})();

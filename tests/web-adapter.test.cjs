// End-to-end test of the deployed build: dist/index.html in jsdom, no window.claude, so the web adapter is used.
// Its fetch() calls are routed to the real server code (netlify/lib/quotes.mjs) running on in-process Postgres (PGlite).
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8").replace(/<link[^>]*fonts[^>]*>/, "");

let fails = 0;
const ok = (n, c, extra) => { if (!c) fails++; console.log((c ? "PASS " : "FAIL ") + n + (c ? "" : "  " + (extra || ""))); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { createQuoteApi } = await import("../netlify/lib/quotes.mjs");

  const pg = new PGlite();
  const sql = async (strings, ...values) => { let t = strings[0]; values.forEach((v, i) => { t += "$" + (i + 1) + strings[i + 1]; }); return (await pg.query(t, values)).rows; };
  // the table is created on the first authorised call, so it may not exist yet
  const count = async () => (await sql`SELECT to_regclass('phoenix_quotes') AS t`)[0].t ? (await sql`SELECT 1 FROM phoenix_quotes`).length : 0;
  const blobs = new Map(), mails = [];
  const env = { APP_ACCESS_KEY: "team-key-123", RESEND_API_KEY: "re_test" };
  const api = createQuoteApi({ env, getSql: () => sql, getStore: () => ({ async set(k, v) { blobs.set(k, v); }, async get(k) { return blobs.has(k) ? blobs.get(k) : null; } }), sendMail: async p => { mails.push(p); return { data: { id: "em_1" }, error: null }; } });
  const routes = { "app-config": () => api.config(), "save-quote": r => api.save(r), "load-quote": r => api.load(r), "search-quotes": r => api.search(r), "send-quote-email": r => api.email(r) };

  const errors = [], anchors = [], objectUrls = [], gcalls = [], uploads = [];
  let mode = "normal", uploadStatuses = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/",
    beforeParse(w) {
      w.addEventListener("error", e => errors.push(e.message));
      w.Element.prototype.scrollIntoView = function () {};
      w.URL.createObjectURL = b => { objectUrls.push(b); return "blob:test/" + objectUrls.length; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { anchors.push({ download: this.download, href: this.href }); };
      w.fetch = async (url, init = {}) => {
        const u = new URL(url, "https://example.test/");
        if (u.hostname === "www.googleapis.com") {
          uploads.push({ url: String(url), headers: init.headers, body: init.body });
          const status = uploadStatuses.length ? uploadStatuses.shift() : 200;
          return status === 200 ? new Response(JSON.stringify({ id: "drive_file_1" }), { status: 200, headers: { "content-type": "application/json" } }) : new Response("expired", { status });
        }
        if (mode === "offline") throw new TypeError("Failed to fetch");
        if (mode === "static") return new Response("<html>Not Found</html>", { status: 404, headers: { "content-type": "text/html" } });
        const name = u.pathname.replace("/.netlify/functions/", "");
        const req = new Request(u.href, { method: init.method || "GET", headers: init.headers, body: init.body });
        return routes[name](req);
      };
    } });
  const w = dom.window, d = w.document;
  const text = () => d.body.textContent;
  const q = s => d.querySelector(s);
  const btn = t => [...d.querySelectorAll("button")].find(b => b.textContent.trim() === t || b.textContent.includes(t));
  const fire = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const readBuf = blob => new Promise(res => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.readAsArrayBuffer(blob); });
  const submitKey = async v => { const box = q(".pk-back form"); fire(box.querySelector("input"), v); box.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); await wait(600); };
  const jobInput = () => [...d.querySelectorAll("input")].find(i => i.placeholder === "e.g. 4376");
  const itemInput = () => [...d.querySelectorAll("input")].find(i => i.placeholder === "e.g. B00630");

  console.log("-- adapter is active");
  ok("page loads with no script errors", errors.length === 0, errors.join("; "));
  ok("no claude.ai runtime, so the web adapter provided window.claude", typeof w.claude === "object" && typeof w.claude.use === "function");
  const caps = await Promise.all(["downloads", "db", "mcp", "nothing"].map(n => w.claude.use(n)));
  ok("adapter offers downloads, db, mcp and nothing else", !!caps[0] && !!caps[1] && !!caps[2] && caps[3] === null);
  ok("calculator renders (gross 1,609 / AUD 2,300)", text().includes("$1,609.00") && text().includes("AUD $2,300.00"));

  console.log("-- downloads (no server needed)");
  btn("Download").click(); await wait(900);
  const pdfDl = anchors.find(a => a.download.endsWith(".pdf"));
  ok("Download triggers a browser save named from job + stage", !!pdfDl && /^s01294_Q1_\d{8}-\d{6}\.pdf$/.test(pdfDl.download), JSON.stringify(anchors));
  const pdfBlob = objectUrls[objectUrls.length - 1];
  const head = new Uint8Array(await readBuf(pdfBlob)).slice(0, 4);
  ok("the saved file is a real PDF", String.fromCharCode(...head) === "%PDF" && pdfBlob.size > 2000);
  btn("Export to GATI").click(); await wait(900);
  ok("GATI export downloads an .xlsx", anchors.some(a => a.download.endsWith("_GATI.xlsx")));

  console.log("-- Sync to DB: access key");
  fire(itemInput(), "B00630");
  btn("Sync to DB").click(); await wait(400);
  ok("first server call asks for the access key", !!q(".pk-back") && /Access key needed/.test(text()));
  q(".pk-back button[type=button]").click(); await wait(300);
  ok("cancelling shows a clear message and saves nothing", !q(".pk-back") && /access key is needed/i.test(text()) && (await count()) === 0);
  btn("Sync to DB").click(); await wait(400);
  await submitKey("wrong-key");
  ok("wrong key is rejected and forgotten", /not accepted/i.test(text()) && !w.localStorage.getItem("phoenix.accessKey") && (await count()) === 0);
  btn("Sync to DB").click(); await wait(400);
  await submitKey("team-key-123");
  const rows = await sql`SELECT * FROM phoenix_quotes`;
  ok("right key: quote saved to Postgres with job/item/stage/customer fields", rows.length === 1 && rows[0].job_no === "s01294" && rows[0].item_no === "B00630" && rows[0].quote_stage === "Q1" && rows[0].tier === "Tier 1" && rows[0].currency === "AUD" && Number(rows[0].total) === 2300, JSON.stringify(rows));
  const key0 = rows[0].filename_base;
  ok("PDF archived in blob storage next to the JSON", Buffer.from(blobs.get(key0 + "/quote.pdf")).toString("latin1").startsWith("%PDF") && JSON.parse(blobs.get(key0 + "/quote.json")).job.jobNo === "s01294");
  ok("key remembered in this browser", w.localStorage.getItem("phoenix.accessKey") === "team-key-123" && !q(".pk-back"));
  btn("Sync to DB").click(); await wait(500);
  ok("same Job/Item/Stage again is refused with the JWY wording", /update your quotation stage/.test(text()) && (await count()) === 1);
  fire(q('input[aria-label="Quote stage"]'), "Q2"); btn("Sync to DB").click(); await wait(600);
  ok("bumping the stage to Q2 saves a second quote (no key prompt this time)", (await count()) === 2 && !q(".pk-back"));

  console.log("-- search + reload from the server");
  const search = q('input[type=search]');
  fire(search, "b006"); await wait(500);
  const res = q(".search-res");
  ok("search hits the server (partial, case-insensitive item #)", res && !res.hidden && res.querySelectorAll("button").length === 2 && /s01294 · B00630 · Q2/.test(res.textContent), res && res.textContent);
  fire(jobInput(), "temporary-change");
  const first = res.querySelectorAll("button")[1];
  first.dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true, cancelable: true })); await wait(500);
  ok("clicking a result reloads the saved snapshot from the server", jobInput().value === "s01294", jobInput().value);
  fire(q('input[type=search]'), "zzzzzz"); await wait(500); // the page re-mounted when the snapshot loaded, so look the box up again
  ok("no match shows the empty message", /No synced quote matches/.test(q(".search-res").textContent));

  console.log("-- Load saved quote dialog");
  fire(jobInput(), "changed-again");
  btn("Load saved quote").click(); await wait(700);
  const saved = d.querySelectorAll(".qlist .qrow button");
  ok("dialog lists the quotes saved on the server", saved.length === 2, String(saved.length));
  saved[0].click(); await wait(600);
  ok("Load restores that quote and closes the dialog", jobInput().value === "s01294" && !d.querySelector(".qlist"), jobInput().value);
  const visible = q("#app").textContent; // not body.textContent: that includes the inlined script source
  ok("Quotes hint describes the website (no claude.ai wording)", /team database/.test(visible) && !/opened from claude\.ai/.test(visible));

  console.log("-- email");
  btn("✉ Email").click();
  const to = q('input[type=email]'); fire(to, "client@example.com");
  btn("Send").click(); btn("Click again").click(); await wait(1200);
  const m = mails[mails.length - 1];
  ok("email goes through the server with the PDF attached", !!m && m.to[0] === "client@example.com" && m.attachments[0].filename.endsWith(".pdf") && Buffer.from(m.attachments[0].content, "base64").toString("latin1").startsWith("%PDF") && /Your Quotation/.test(m.subject) && /Dear/.test(m.html), JSON.stringify(m && { to: m.to, s: m.subject }));
  ok("status says Sent", /Sent/.test(text()));

  console.log("-- Save to Drive");
  btn("Save to Drive").click(); await wait(600);
  ok("not configured -> clear message, nothing uploaded", /GOOGLE_CLIENT_ID/.test(text()) && uploads.length === 0);
  env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com"; env.GOOGLE_DRIVE_FOLDER_ID = "fold123";
  let n = 0;
  w.google = { accounts: { oauth2: { initTokenClient: c => ({ requestAccessToken: () => { gcalls.push(c.scope); c.callback({ access_token: n++ ? "tok2" : "tok", expires_in: 3600 }); } }) } } };
  btn("Save to Drive").click(); await wait(900);
  const up = uploads[0];
  ok("Drive upload: narrow scope, bearer token, target folder, PDF content", gcalls[0] === "https://www.googleapis.com/auth/drive.file" && !!up && up.headers.Authorization === "Bearer tok" && up.body.includes('"parents":["fold123"]') && up.body.includes("JVBERi") && /\.pdf/.test(up.body) && /Saved to Drive/.test(text()), JSON.stringify(up && up.headers));
  uploadStatuses = [401, 200];
  const before = uploads.length;
  btn("Save to Drive").click(); await wait(900);
  ok("expired Google token: signs in again once and retries", uploads.length === before + 2 && uploads[before + 1].headers.Authorization === "Bearer tok2", uploads.length - before + " uploads; " + uploads.slice(before).map(u => u.headers.Authorization).join());

  console.log("-- failure modes");
  mode = "offline";
  btn("Sync to DB").click(); await wait(400);
  ok("offline -> friendly message", /Can't reach the server/.test(text()));
  mode = "static";
  btn("Sync to DB").click(); await wait(400);
  ok("static host without functions -> tells you to deploy with Netlify", /aren't set up on this site/.test(text()));
  mode = "normal";
  const savedKey = env.APP_ACCESS_KEY; env.APP_ACCESS_KEY = "";
  btn("Sync to DB").click(); await wait(400);
  ok("server without APP_ACCESS_KEY is locked and says why", /APP_ACCESS_KEY is not set/.test(text()));
  env.APP_ACCESS_KEY = savedKey;

  ok("no runtime errors", errors.length === 0, errors.join("; "));
  console.log(fails ? "\n" + fails + " FAILED" : "\nall web-adapter checks passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

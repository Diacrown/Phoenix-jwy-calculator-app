/* ---------- Phoenix Calculator app ---------- */
(function () {
  "use strict";
  const OZ = 31.1035;
  const KEY = "phoenix.calc.v3";
  const CUR_SYM = { USD: "$", EUR: "€", GBP: "£", AUD: "AUD $", NZD: "NZD $", PLN: "zł", INR: "₹" };
  const COLOR_LABEL = { WHITE: "White Gold", "WHITE-PD": "White Gold (Palladium)", YELLOW: "Yellow Gold", ROSE: "Rose Gold" };

  /* ---- helpers ---- */
  const fmt = (n, d = 2) => { const v = Number(n || 0); return Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "0.00"; };
  const money = n => "$" + fmt(n);
  const localMoney = (n, c) => (CUR_SYM[c] || "$") + fmt(n);
  const clone = o => JSON.parse(JSON.stringify(o));
  const isObj = o => o && typeof o === "object" && !Array.isArray(o);
  function deepFill(dst, src) { for (const k in src) { if (isObj(src[k]) && isObj(dst[k])) deepFill(dst[k], src[k]); else dst[k] = src[k]; } return dst; }
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    let val;
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "value") val = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
    if (val !== undefined) e.value = val;
    return e;
  }
  let idc = 0;
  const uid = p => p + "-" + (++idc);
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const flash = (el, text, ms = 4000) => { el.textContent = text; clearTimeout(el._t); if (text && ms) el._t = setTimeout(() => { el.textContent = ""; }, ms); };

  /* ---- state ---- */
  const idxOf = code => CATALOG.findIndex(c => c[0] === code);
  const blankLine = () => ({ type: "Mined", typeText: "", shape: "", shapeText: "", idx: null, custom: false, desc: "", q: "TW SI1", lgd: "SSP", qText: "", proposed: "", pcs: "", wtPc: "", ppc: "" });
  const blankMetal = () => ({ metal: "", color: "", grams: "" });
  function jobBase() {
    return { by: "", loc: "WSSY", date: todayStr(), jobNo: "", itemNo: "", itemSize: "", customer: "", render: "", itemType: "", subCategory: "", tier: "Tier 1",
      metals: [blankMetal(), blankMetal()], lines: Array.from({ length: 5 }, blankLine), stage: "Q1", variant: "full", currency: "usd", override: "", overrideUsd: "", extraName: "", extraAmt: "", remarks: "" };
  }
  function sampleJob() {
    const mk = (type, code, extra) => Object.assign(blankLine(), { type, idx: idxOf(code), shape: CATALOG[idxOf(code)][1] }, extra);
    const lines = [
      mk("Mined", "RND050W", { q: "WH SI" }), mk("Mined", "RND2.4M", { q: "WH SI" }), mk("Mined", "HRT3943M", { q: "TW SI3" }),
      mk("Mined", "RND1.0M", { q: "TW SI3" }), mk("Mined", "RND1.0M", { q: "TW SI3" }), mk("Mined", "RND1.0M", { q: "TW SI3" }),
      mk("Lab grown", "RND1.6M", { lgd: "SSP" }), mk("Mined", "RND050W", { q: "TW VS" }),
      Object.assign(blankLine(), { shape: CUSTOM, shapeText: "Manual stone", custom: true, pcs: "2", wtPc: "2.01", ppc: "200" })
    ];
    return Object.assign(jobBase(), { by: "kunal", jobNo: "s01294", metals: [{ metal: "18KT", color: "YELLOW", grams: "6.3" }, blankMetal()], lines });
  }
  function normaliseJob(j) {
    const job = Object.assign(jobBase(), j);
    delete job.cadType; delete job.mode;
    job.loc = "WSSY";
    if (!DEFAULT_RATES.tiers.some(t => t.name === job.tier)) job.tier = "Tier 1";
    job.metals = [0, 1].map(i => Object.assign(blankMetal(), (j.metals || [])[i] || {}));
    job.lines = (Array.isArray(j.lines) && j.lines.length ? j.lines : Array.from({ length: 5 }, blankLine)).map(l => {
      const line = Object.assign(blankLine(), l);
      if (line.shape === CUSTOM) { line.custom = true; if (!line.shapeText && line.desc) { line.shapeText = line.desc; line.desc = ""; } }
      return line;
    });
    return job;
  }
  function loadState() {
    try {
      const s = localStorage.getItem(KEY);
      if (!s) return null;
      const o = JSON.parse(s);
      if (!o || !o.job) return null;
      const rates = clone(DEFAULT_RATES);
      if (o.rates && o.rates.spot) deepFill(rates.spot, o.rates.spot);
      return { rates, job: normaliseJob(o.job) };
    } catch (e) { return null; }
  }
  let S = loadState() || { rates: clone(DEFAULT_RATES), job: sampleJob() };
  const IMG = { cad: [], ref: [] };
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ rates: { spot: S.rates.spot }, job: S.job })); } catch (e) { /* storage blocked */ } }, 250);
  }

  const ui = { rows: [], thumbs: {}, chips: {}, metalNotes: [], synced: null };
  let Q = null;

  /* ---- runtime capabilities (only exist inside the published page) ---- */
  const WEB = !!(window.claude && window.claude.web); // true on the deployed website (web-adapter.js), false inside claude.ai
  const capMemo = {};
  async function cap(name) {
    if (capMemo[name]) return capMemo[name];
    try {
      const c = window.claude && window.claude.use ? await window.claude.use(name) : null;
      if (c) capMemo[name] = c;
      return c || null;
    } catch (e) { return null; }
  }
  function mcpMessage(e, server) {
    const c = e && e.code;
    if (c === "needs_reauth") return "Reconnect " + server + " in claude.ai Settings > Connectors.";
    if (c === "server_not_connected") return "Add " + server + " in claude.ai Settings > Connectors.";
    if (c === "not_in_manifest") return server + " access was turned off for this page.";
    if (c === "blocked_by_policy" || c === "approval_required") return "Your organisation does not allow this " + server + " action.";
    if (c === "selection_required") return "Choose which " + server + " connection to use, then try again.";
    return (e && e.message) || "Something went wrong.";
  }

  /* ---- binding helpers ---- */
  function bind(el, obj, key, after) {
    el.value = obj[key] == null ? "" : obj[key];
    el.addEventListener("input", () => { obj[key] = el.value; if (after) after(); update(); });
    return el;
  }
  function sel(options, obj, key, cls) {
    const s = h("select", { class: cls || "inp", id: uid("sel") },
      options.map(o => Array.isArray(o) ? h("option", { value: o[0] }, o[1]) : h("option", { value: o }, o)));
    return bind(s, obj, key);
  }
  const fld = (label, el, cls) => h("label", { class: "f" + (cls ? " " + cls : "") }, h("span", null, label), el);
  const numIn = (obj, key, opt = {}) => bind(h("input", { type: "number", step: opt.step || "any", min: opt.min, placeholder: opt.ph, class: opt.cls || "inp num", id: uid("n"), inputmode: "decimal" }), obj, key, opt.after);
  const txtIn = (obj, key, extra = {}) => bind(h("input", Object.assign({ type: "text", class: "inp", id: uid("t"), autocomplete: "off" }, extra)), obj, key);
  function twoStep(btn, label, fn) {
    let t = null; const orig = btn.textContent;
    btn.addEventListener("click", () => {
      if (t) { clearTimeout(t); t = null; btn.textContent = orig; btn.classList.remove("danger"); fn(); return; }
      btn.textContent = "Click again: " + label; btn.classList.add("danger");
      t = setTimeout(() => { t = null; btn.textContent = orig; btn.classList.remove("danger"); }, 3500);
    });
    return btn;
  }
  async function copyText(text, host) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      if (host) { const ta = h("textarea", { class: "inp", readonly: true, "aria-label": "Text to copy" }); ta.value = text; host.replaceChildren(ta); ta.focus(); ta.select(); }
      return false;
    }
  }
  const sectionLabel = (n, t) => h("div", { class: "sec-label" }, h("span", { class: "eyebrow" }, n), h("span", { class: "panel-title" }, t));

  /* ---- dialogs ---- */
  function closeDialog() { if (ui.dlg) { ui.dlg.remove(); ui.dlg = null; } }
  function openDialog(title, body, wide) {
    closeDialog();
    const overlay = h("div", { class: "overlay", onmousedown: e => { if (e.target === overlay) closeDialog(); } },
      h("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": title, style: wide ? "max-width:900px" : null },
        h("div", { class: "dialog-h" }, h("h2", null, title), h("button", { class: "small-btn", type: "button", onclick: closeDialog }, "Close")),
        h("div", { class: "dialog-b" }, body)));
    document.body.append(overlay); ui.dlg = overlay;
    const b = overlay.querySelector(".dialog-h button"); if (b) b.focus();
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && ui.dlg) closeDialog(); });

  /* ---- metals ---- */
  const isPlain = m => ["PLATINUM", "SILVER"].includes(norm(m));
  function alloyOptions(R) {
    const out = [];
    R.metals.forEach(m => {
      const u = norm(m.name);
      if (isPlain(u)) out.push({ v: m.name + "|", label: m.name });
      else R.colors.forEach(c => { if (u === "22KT" && norm(c.name) !== "YELLOW") return; out.push({ v: m.name + "|" + c.name, label: m.name + " " + (COLOR_LABEL[c.name] || c.name) }); });
    });
    return out;
  }
  const alloyLabel = m => { const o = alloyOptions(S.rates).find(x => x.v === (m.metal + "|" + (isPlain(m.metal) ? "" : m.color))); return o ? o.label : (m.metal || ""); };

  function metalCard(title, m, k) {
    const opts = alloyOptions(S.rates);
    const s = h("select", { class: "inp", id: uid("alloy"), "aria-label": title + " alloy" }, h("option", { value: "" }, "Select alloy..."), opts.map(o => h("option", { value: o.v }, o.label)));
    s.value = m.metal ? m.metal + "|" + (isPlain(m.metal) ? "" : m.color) : "";
    s.addEventListener("input", () => { const p = s.value.split("|"); m.metal = p[0] || ""; m.color = m.metal ? (p[1] || "WHITE") : ""; update(); });
    const note = h("span", { class: "hint", style: "margin:0" }); ui.metalNotes[k] = note;
    return h("div", { class: "card" }, h("div", { class: "card-h" }, title),
      h("div", { class: "field-row", style: "margin-top:0" }, fld("Alloy", s, "w2"), fld("Gram wt", numIn(m, "grams", { min: 0, ph: "0.00" }))), note);
  }

  /* ---- 03 rate book ---- */
  const CHIPS = [["metalRates", r => [r.spot]], ["alloys", r => [r.metals, r.colors]], ["currencyRates", r => [r.fx, r.fxUse]], ["locations", r => [r.locations]],
    ["tiers", r => [r.tiers]], ["naturalPrices", r => [r.ssp, r.sspCols]], ["labGrownPrices", r => []]];
  function paintChips() {
    CHIPS.forEach(([k, f]) => {
      const el = ui.chips[k]; if (!el) return;
      const edited = JSON.stringify(f(S.rates)) !== JSON.stringify(f(DEFAULT_RATES));
      el.className = "chip " + (edited ? "edited" : "on"); el.textContent = k + (edited ? " · edited" : "");
    });
  }
  function spotCells(s) {
    const gm = numIn(s, "gm", { min: 0, cls: "inp-sm num" });
    const recompute = () => { s.gm = Math.round(num(s.oz) / OZ * num(s.markup) * 100) / 100; gm.value = s.gm; };
    return [h("td", { class: "td" }, txtIn(s, "asOf", { class: "inp-sm" })), h("td", { class: "td" }, numIn(s, "oz", { min: 0, cls: "inp-sm num", after: recompute })),
      h("td", { class: "td" }, numIn(s, "markup", { min: 0, cls: "inp-sm num", after: recompute })), h("td", { class: "td" }, gm)];
  }
  function paintRateTable() {
    if (!ui.rateBody) return;
    const R = S.rates;
    const rows = [["Gold 999", "gold"], ["Platinum", "platinum"], ["Silver", "silver"]].map(([label, key]) => {
      const s = R.spot[key];
      if (ui.manualRates) return h("tr", null, h("td", { class: "td" }, label), ...spotCells(s));
      return h("tr", null, h("td", { class: "td" }, label), h("td", { class: "td mute" }, s.asOf), h("td", { class: "td n" }, money(s.oz)), h("td", { class: "td n" }, "× " + fmt(s.markup, 2)), h("td", { class: "td n" }, money(s.gm) + " /gm"));
    });
    ui.rateBody.replaceChildren(...rows);
    ui.rateBtn.textContent = ui.manualRates ? "Done editing" : "Enter rates manually";
  }
  function buildRateBook() {
    ui.chips = {};
    const chips = h("div", { class: "chips" }, CHIPS.map(([k]) => (ui.chips[k] = h("span", { class: "chip on" }, k))));
    ui.rateBody = h("tbody");
    ui.rateBtn = h("button", { class: "small-btn", type: "button", onclick: () => { ui.manualRates = !ui.manualRates; paintRateTable(); } }, "Enter rates manually");
    ui.totalG = h("b", null, "0.000");
    const c = h("div", { class: "card" },
      h("div", { class: "row-between" }, sectionLabel("03", "Rate book"), h("div", { class: "rate-status" }, h("span", null, h("span", { class: "dot" }), "Rates from your Phoenix sheets, 28 Sep 2026"))),
      chips,
      h("p", { class: "sync-note" }, "Diamond prices, tiers, alloys, currency and location are built in from your Phoenix sheets. Only the metal rates can be edited here. Live Google Sheet sync needs the JWY calculator's server and is not part of this page."),
      h("div", { class: "row-between", style: "margin-top:10px" }, h("span", { class: "subhead" }, "Precious metal rates"), ui.rateBtn),
      h("div", { class: "table-scroll" }, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["Metal", "As on", "PM rate/oz", "Markup", "$/gm"].map((t, i) => h("th", { class: i > 1 ? "r" : "" }, t)))), ui.rateBody)),
      h("div", { class: "total-gram" }, "Total gram weight: ", ui.totalG, " g"));
    paintRateTable();
    return c;
  }

  /* ---- 04 stone schedule ---- */
  const shapesInCatalog = SHAPE_ORDER.filter(s => CATALOG.some(c => c[1] === s));
  function rebuildRow(i, focusKey) {
    const old = ui.rows[i] && ui.rows[i].tr; if (!old) return;
    const tr = buildRow(i); old.replaceWith(tr);
    if (focusKey) { const el = tr.querySelector('[data-k="' + focusKey + '"]'); if (el) el.focus(); }
  }
  function rebuildRows() { ui.rows = []; ui.tbody.replaceChildren(...S.job.lines.map((_, i) => buildRow(i))); }
  /* A custom entry: the select turns into a text box in the same cell, with a small button to go back to the list. */
  function customBox(L, key, placeholder, label, dk, back, width) {
    const inp = bind(h("input", { type: "text", class: "inp-sm", placeholder, "data-k": dk, "aria-label": label, autocomplete: "off", style: "min-width:" + (width || 96) + "px" }), L, key);
    return h("div", { class: "cust" }, inp, h("button", { class: "cust-back", type: "button", title: "Back to the list", "aria-label": "Back to the list: " + label, onclick: () => { back(); update(); } }, "↩"));
  }
  function buildRow(i) {
    const L = S.job.lines[i], n = "Line " + (i + 1) + " ";
    const r = {};
    r.pos = h("td", { class: "td" });
    const mined = L.type === "Mined", lgd = L.type === "Lab grown";

    // Type
    let type;
    if (L.type === CUSTOM) type = customBox(L, "typeText", "Type name", n + "custom type", "typeText", () => { L.type = "Mined"; L.typeText = ""; rebuildRow(i, "type"); }, 90);
    else {
      type = h("select", { class: "inp-sm w96", "data-k": "type", "aria-label": n + "type" }, STONE_TYPES.map(t => h("option", { value: t }, t)), h("option", { value: CUSTOM }, "Custom entry…"));
      type.value = L.type || "Mined";
      type.addEventListener("change", () => {
        L.type = type.value; if (L.type === "Lab grown" && !L.lgd) L.lgd = "SSP";
        rebuildRow(i, L.type === CUSTOM ? "typeText" : "type"); update();
      });
    }

    // Shape
    let shape;
    if (L.shape === CUSTOM) shape = customBox(L, "shapeText", "Shape name", n + "custom shape", "shapeText", () => { L.shape = ""; L.shapeText = ""; L.custom = false; L.idx = null; L.desc = ""; L.wtPc = ""; rebuildRow(i, "shape"); }, 90);
    else {
      shape = h("select", { class: "inp-sm", "data-k": "shape", "aria-label": n + "shape" }, h("option", { value: "" }, "Select shape"), shapesInCatalog.map(s => h("option", { value: s }, s)), h("option", { value: CUSTOM }, "Custom entry…"));
      shape.value = L.shape || "";
      shape.addEventListener("change", () => {
        const v = shape.value;
        L.idx = null; L.wtPc = ""; L.desc = "";
        if (v === CUSTOM) { L.shape = CUSTOM; L.custom = true; L.shapeText = ""; } else { L.shape = v; L.custom = false; L.shapeText = ""; }
        rebuildRow(i, v === CUSTOM ? "shapeText" : "shape"); update();
      });
    }

    // Size
    let size;
    if (!L.shape) size = h("select", { class: "inp-sm", disabled: true, "aria-label": n + "size" }, h("option", null, "Select shape first"));
    else if (L.shape === CUSTOM) size = bind(h("input", { type: "text", class: "inp-sm", placeholder: "Size / description", "data-k": "sizeText", "aria-label": n + "size description", style: "min-width:120px", autocomplete: "off" }), L, "desc");
    else if (L.custom) size = customBox(L, "desc", "Size / description", n + "custom size", "sizeText", () => { L.custom = false; L.desc = ""; L.idx = null; L.wtPc = ""; rebuildRow(i, "size"); }, 110);
    else {
      size = h("select", { class: "inp-sm", "data-k": "size", "aria-label": n + "size", style: "min-width:130px" }, h("option", { value: "" }, "Select size"),
        CATALOG.map((c, k) => c[1] === L.shape ? h("option", { value: String(k) }, c[0] + " · " + (c[2] ? c[2] : "no size listed") + (c[3] != null ? " (" + c[3] + "ct)" : "")) : null),
        h("option", { value: CUSTOM }, "Custom entry…"));
      size.value = L.idx == null ? "" : String(L.idx);
      size.addEventListener("change", () => {
        if (size.value === CUSTOM) { L.custom = true; L.idx = null; L.desc = ""; L.wtPc = ""; rebuildRow(i, "sizeText"); }
        else { L.idx = size.value === "" ? null : Number(size.value); L.wtPc = ""; rebuildRow(i, "size"); }
        update();
      });
    }
    r.spec = h("td", { class: "td ell mute", style: "font-size:12px" });

    // Quality
    let qual;
    if (mined && L.q === CUSTOM) qual = customBox(L, "qText", "Quality", n + "custom quality", "qualityText", () => { L.q = "TW SI1"; L.qText = ""; rebuildRow(i, "quality"); }, 80);
    else if (lgd && L.lgd === CUSTOM) qual = customBox(L, "qText", "Quality", n + "custom quality", "qualityText", () => { L.lgd = "SSP"; L.qText = ""; rebuildRow(i, "quality"); }, 80);
    else if (mined || lgd) {
      const key = mined ? "q" : "lgd";
      const opts = mined ? NATURAL_GRADES.map(g => [g, g]) : LGD_GRADE_OPTS;
      qual = h("select", { class: "inp-sm", "data-k": "quality", "aria-label": n + "quality", style: "min-width:96px" }, opts.map(o => h("option", { value: o[0] }, o[1])), h("option", { value: CUSTOM }, "Custom entry…"));
      qual.value = L[key] || opts[0][0];
      qual.addEventListener("change", () => { L[key] = qual.value; if (qual.value === CUSTOM) { L.qText = ""; rebuildRow(i, "qualityText"); } update(); });
    } else qual = bind(h("input", { type: "text", class: "inp-sm", placeholder: "Quality (optional)", "data-k": "qualityText", "aria-label": n + "quality", title: "Priced by hand: enter the $/ct", style: "min-width:96px", autocomplete: "off" }), L, "qText");

    const proposed = bind(h("input", { type: "text", class: "inp-sm", placeholder: "e.g. VS clarity", "aria-label": n + "proposed quality", title: "Shown to the customer on the Price only print, in place of the internal grade", style: "min-width:70px;width:84px" }), L, "proposed");
    const c = !L.custom && L.shape !== CUSTOM && L.idx != null ? CATALOG[L.idx] : null;
    const needsWt = L.custom || (c && c[3] == null);
    if (needsWt) { r.wtCell = h("td", { class: "td" }, bind(h("input", { type: "number", step: "any", min: 0, class: "inp-sm num w72", placeholder: "ct/pc", "aria-label": n + "weight per piece" }), L, "wtPc")); r.wt = null; }
    else { r.wt = h("td", { class: "td n" }); r.wtCell = r.wt; }
    const pcs = bind(h("input", { type: "number", step: "1", min: 0, class: "inp-sm num w56", placeholder: "qty", "aria-label": n + "pieces" }), L, "pcs");
    r.tot = h("td", { class: "td n" });
    r.ppc = bind(h("input", { type: "number", step: "any", min: 0, class: "inp-sm ppc", "aria-label": n + "price per carat" }), L, "ppc");
    r.amt = h("td", { class: "td n" });
    const clr = h("button", { class: "clr", type: "button", title: "Remove line " + (i + 1), "aria-label": "Remove line " + (i + 1), onclick: () => { S.job.lines.splice(i, 1); if (!S.job.lines.length) S.job.lines.push(blankLine()); rebuildRows(); update(); } }, "×");
    r.tr = h("tr", null, r.pos, h("td", { class: "td" }, type), h("td", { class: "td" }, shape), h("td", { class: "td" }, size), r.spec, h("td", { class: "td" }, qual), h("td", { class: "td" }, proposed),
      r.wtCell, h("td", { class: "td" }, pcs), r.tot, h("td", { class: "td" }, r.ppc), r.amt, h("td", { class: "td" }, clr));
    ui.rows[i] = r;
    return r.tr;
  }
  function paintRow(i, lc) {
    const r = ui.rows[i], L = S.job.lines[i]; if (!r) return;
    r.tr.classList.toggle("active", lc.active);
    const flag = lc.active && (lc.noPrice || lc.noWeight);
    r.pos.replaceChildren(...(flag ? [h("span", { class: "flagdot", title: lc.noWeight ? "No weight" : "No price" })] : []), h("span", { class: "pos" + (lc.active ? " on" : "") }, String(i + 1)));
    r.spec.textContent = lc.cat ? lc.spec : ""; r.spec.title = r.spec.textContent;
    if (r.wt) r.wt.textContent = lc.wtPc ? fmt(lc.wtPc, 3) : "";
    r.tot.textContent = fmt(lc.total, 3);
    const hasSize = !!lc.cat || L.custom;
    r.ppc.placeholder = !hasSize ? "$0.00" : (lc.autoPpc > 0 ? money(lc.autoPpc) : "enter $/ct");
    r.ppc.classList.toggle("has-auto", !hasSize || (lc.autoPpc > 0 && !lc.overridden));
    r.ppc.classList.toggle("over", lc.overridden);
    r.ppc.classList.toggle("need", hasSize && lc.autoPpc <= 0 && !lc.overridden);
    r.amt.textContent = money(lc.amount);
  }
  function whyNoPrice(lc, L) {
    if (lc.typeCustom) return (lc.type || "a custom type") + " is a custom type, priced by hand";
    if (lc.qCustom) return "a custom quality has no price table";
    if (lc.type === "Mined") {
      if (!lc.cat) return "priced by hand";
      if (!lc.cat[4]) return "no SSP group for " + lc.cat[1] + " stones";
      return "no " + lc.cat[4] + " price for " + L.q;
    }
    if (lc.type === "Lab grown") return lc.lgdNote || (lc.cat && !lc.cat[4] && (L.lgd || "SSP") === "SSP" ? "the SSP grid has no LGD price for this shape" : (lc.cat ? "no LGD price for this size" : "priced by hand"));
    return lc.type + " is priced by hand";
  }
  function paintNotes(q) {
    const notes = [];
    q.lines.forEach((lc, i) => {
      if (!lc.active) return;
      const L = S.job.lines[i], code = lc.cat ? lc.cat[0] : (L.desc || L.shapeText || "custom");
      if (lc.noWeight) notes.push("Line " + (i + 1) + " (" + code + "): no weight is listed for this size. Enter the ct/pc.");
      if (lc.noPrice) notes.push("Line " + (i + 1) + " (" + code + "): " + whyNoPrice(lc, L) + ". Enter a $/ct.");
    });
    ui.notes.hidden = !notes.length;
    ui.notes.replaceChildren(...notes.map(t => h("div", null, t)));
  }
  function buildStones() {
    ui.tbody = h("tbody");
    S.job.lines.forEach((_, i) => ui.tbody.append(buildRow(i)));
    ui.fPcs = h("td", { class: "td n" }); ui.fCt = h("td", { class: "td n" }); ui.fDia = h("td", { class: "td n" });
    const heads = ["Pos", "Type", "Shape", "Size", "Spec", "Quality", "Proposed quality", "Wt/pc", "Pcs", "Total wt", "$/ct", "$ total", ""];
    const right = new Set(["Wt/pc", "Pcs", "Total wt", "$/ct", "$ total"]);
    ui.notes = h("div", { class: "warn-banner", role: "status", hidden: true });
    return h("div", { class: "card" }, sectionLabel("04", "Stone schedule"),
      h("div", { class: "table-scroll" }, h("table", { class: "tbl stones" },
        h("thead", null, h("tr", null, heads.map(t => h("th", { class: right.has(t) ? "r" : "" }, t)))), ui.tbody,
        h("tfoot", null, h("tr", null, h("td", { colspan: 8 }, "Totals"), ui.fPcs, ui.fCt, h("td"), ui.fDia, h("td"))))),
      ui.notes,
      h("button", { class: "small-btn", type: "button", style: "margin-top:10px", onclick: () => { S.job.lines.push(blankLine()); rebuildRows(); update(); } }, "+ Add custom stone row"));
  }

  /* ---- 01 job details ---- */
  async function loadSynced(force) {
    if (!force && ui.synced && Date.now() - ui.syncedAt < 30000) return ui.synced;
    const db = await cap("db");
    if (!db) { ui.synced = null; return null; }
    try {
      const snap = await db.collection("quotes").orderBy("savedAt", "desc").limit(100).get();
      ui.synced = snap.docs.map(d => Object.assign({ _id: d.id }, d.data())); ui.syncedAt = Date.now();
    } catch (e) { ui.synced = null; }
    return ui.synced;
  }
  function snapFromDoc(d) { try { const o = JSON.parse(d.json); return o && o.job ? o : null; } catch (e) { return null; } }
  // Search: the deployed build searches on the server (db.searchQuotes); inside claude.ai the recent list is filtered here.
  async function findSynced(t) {
    const db = await cap("db");
    if (!db) return null;
    if (typeof db.searchQuotes === "function") return db.searchQuotes(t);
    const list = await loadSynced(false);
    return list ? list.filter(s => [s.jobNo, s.itemNo, s.customer].join(" ").toLowerCase().includes(t)) : null;
  }
  // A search hit either carries its JSON snapshot (claude.ai database) or knows how to fetch it (deployed database).
  // Returns null when the quote was applied, otherwise a short reason.
  async function openSynced(s) {
    try {
      const o = snapFromDoc(s) || (typeof s._load === "function" ? await s._load() : null);
      if (!o || !o.job) return "That saved quote could not be read.";
      applySnapshot(o); return null;
    } catch (e) { return (e && e.message) || "Could not load that quote."; }
  }
  function quoteLabel(d) { return (d.jobNo || "no job #") + (d.itemNo ? " · " + d.itemNo : "") + " · " + (d.stage || "Q1"); }
  function buildSearch() {
    const input = h("input", { type: "search", class: "inp", id: uid("search"), placeholder: "Search Job#/Item# history...", "aria-label": "Search synced quotes", autocomplete: "off" });
    const res = h("div", { class: "search-res", hidden: true });
    let runSeq = 0;
    const say = msg => { res.replaceChildren(h("div", { class: "none" }, msg)); res.hidden = false; };
    const run = async () => {
      const t = input.value.trim().toLowerCase();
      if (!t) { runSeq++; res.hidden = true; return; }
      const seq = ++runSeq;
      let list;
      try { list = await findSynced(t); } catch (e) { if (seq === runSeq) say((e && e.message) || "Search failed."); return; }
      if (seq !== runSeq) return; // a newer keystroke superseded this lookup
      if (!list) { say("The quote database is not available here. Open this page from claude.ai and sign in."); return; }
      const hits = list.slice(0, 8);
      res.replaceChildren(...(hits.length ? hits.map(s => h("button", { type: "button", onmousedown: e => { e.preventDefault(); openSynced(s); } },
        h("b", null, quoteLabel(s)), h("br"), h("span", { class: "mute small" }, (s.customer || "no customer") + " · synced " + new Date(s.savedAt).toLocaleString()))) : [h("div", { class: "none" }, "No synced quote matches. Use Sync to DB in the Quotes section to save one.")]));
      res.hidden = false;
    };
    input.addEventListener("input", run);
    input.addEventListener("focus", () => { cap("db").then(db => { if (db && typeof db.searchQuotes !== "function") loadSynced(true); }); });
    input.addEventListener("blur", () => setTimeout(() => { res.hidden = true; }, 150));
    return h("div", { class: "search-wrap" }, input, res);
  }
  function buildDetails() {
    const j = S.job, R = S.rates;
    const loc = h("select", { class: "inp", id: uid("loc") }, R.locations.map(l => h("option", { value: l.code }, l.code + " · " + l.cur + " · " + fmt(l.duty, 0) + "% duty"))); bind(loc, j, "loc");
    return h("div", { class: "card" },
      h("div", { class: "row-between" }, sectionLabel("01", "Job details"), buildSearch()),
      h("div", { class: "field-row" },
        fld("Designer", txtIn(j, "by", { placeholder: "e.g. Sudip" })), fld("Job #", txtIn(j, "jobNo", { placeholder: "e.g. 4376" })), fld("Item #", txtIn(j, "itemNo", { placeholder: "e.g. B00630" })),
        fld("Item size", txtIn(j, "itemSize", { placeholder: "e.g. UK O" })), fld("Date", bind(h("input", { type: "date", class: "inp", id: uid("date") }), j, "date"))),
      h("div", { class: "field-row" },
        fld("Customer", txtIn(j, "customer", { placeholder: "Customer name" }), "w2"), fld("Location", loc),
        fld("3D render link (optional)", txtIn(j, "render", { placeholder: "https://sketchfab.com/... or turntable video URL" }), "w2")));
  }

  /* ---- 02 tier pricing (the Phoenix structure) ---- */
  const tierRule = t => t.limit == null ? "flat" : "up to " + fmt(t.limit, 0) + " g, then +" + money(t.extra) + " /gm";
  function buildTiers() {
    ui.tierBtns = [];
    const grid = h("div", { class: "tier-grid", role: "radiogroup", "aria-label": "Casting tier" }, S.rates.tiers.map(t => {
      const b = h("button", { type: "button", class: "tier", role: "radio", onclick: () => { S.job.tier = t.name; update(); } },
        h("span", { class: "tier-n" }, t.name), h("span", { class: "tier-p" }, money(t.base)), h("span", { class: "tier-r" }, tierRule(t)), h("span", { class: "tier-c" }));
      b.dataset.tier = t.name; ui.tierBtns.push(b); return b;
    }));
    ui.tierNote = h("p", { class: "hint" });
    return h("div", { class: "card" }, h("div", { class: "row-between" }, sectionLabel("02", "Tier pricing"), h("span", { class: "mute small" }, "Gross = metal + tier charge + diamonds")), grid, ui.tierNote);
  }
  function paintTiers(q) {
    const g = q.grams;
    ui.tierBtns.forEach(b => {
      const on = b.dataset.tier === S.job.tier;
      b.setAttribute("aria-checked", on ? "true" : "false"); b.classList.toggle("on", on);
      b.querySelector(".tier-c").textContent = g > 0 ? "at " + fmt(g, 2) + " g: " + money(tierCharge(b.dataset.tier, g, S.rates)) : "";
    });
    const t = S.rates.tiers.find(x => x.name === S.job.tier);
    ui.tierNote.textContent = g > 0
      ? S.job.tier + " charge for " + fmt(g, 2) + " g is " + money(q.tier) + (t && t.limit != null && g > num(t.limit) ? " (" + fmt(g - num(t.limit), 2) + " g over the " + fmt(t.limit, 0) + " g limit)" : "") + ". Casting, labor, setting and CAD are included in the tier charge."
      : "Enter the metal weight to see the tier charge. Casting, labor, setting and CAD are included in the tier charge.";
  }

  /* ---- images ---- */
  function compress(url, max = 900) {
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { try { const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.width * s)); c.height = Math.max(1, Math.round(im.height * s)); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.82)); } catch (e) { res(url); } };
      im.onerror = () => res(url); im.src = url;
    });
  }
  const readDataUrl = f => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(f); });
  function renderThumbs(kind) {
    const host = ui.thumbs[kind]; if (!host) return;
    host.replaceChildren(...IMG[kind].map((u, i) => h("div", { class: "thumb-wrap" },
      h("button", { class: "thumb", type: "button", title: "Preview full size", onclick: () => openDialog("Image", h("div", { class: "lightbox" }, h("img", { src: u, alt: (kind === "cad" ? "CAD render " : "Client reference ") + (i + 1) }))) }, h("img", { src: u, alt: "" })),
      h("button", { class: "thumb-x", type: "button", "aria-label": "Remove image", onclick: () => { IMG[kind].splice(i, 1); renderThumbs(kind); } }, "×"))),
      h("button", { class: "small-btn", type: "button", onclick: () => host.parentNode.querySelector("input[type=file]").click() }, "+ Add"));
  }
  function buildImages() {
    const mk = (kind, label) => {
      const file = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, "aria-label": "Add " + label + " images" });
      file.addEventListener("change", async () => { const fs = [...file.files]; file.value = ""; for (const f of fs) { const u = await readDataUrl(f); if (u) IMG[kind].push(await compress(u)); } renderThumbs(kind); });
      ui.thumbs[kind] = h("div", { class: "thumbs" });
      return h("div", null, h("span", { class: "lab" }, label), ui.thumbs[kind], file);
    };
    const c = h("div", { class: "card" }, h("div", { class: "row-between" }, h("span", { class: "panel-title" }, "Images"), h("span", { class: "mute small" }, "Auto-filled by order data import. Click a thumbnail to preview full-size.")),
      h("div", { class: "imgs" }, mk("cad", "CAD renders"), mk("ref", "Client reference")));
    renderThumbs("cad"); renderThumbs("ref");
    return c;
  }

  /* ---- quote sheet, text ---- */
  function stoneRows() { return Q.lines.map((lc, i) => ({ lc, L: S.job.lines[i], i })).filter(x => x.lc.active && x.lc.total > 0); }
  const shapeSizeText = lc => lc.cat ? lc.cat[1] + " · " + lc.spec : ([lc.shapeName, lc.spec].filter(Boolean).join(" ") || "Custom stone");
  function componentList(q, j) {
    const l = [["Metal", q.metal], ["Casting · " + j.tier, q.tier], ["Diamonds", q.diamonds]];
    if (q.extra > 0) l.push([j.extraName || "Additional charge", q.extra]);
    return l;
  }
  const finalText = q => q.finalLocal == null ? "no rate" : localMoney(q.finalLocal, q.cur);
  const usdText = q => "USD " + money(q.finalUsd);
  // Which totals the preview, text summary and PDF carry: "usd" (default), "local" (AUD only), "both" (Normal)
  const curMode = (j, q) => q.cur === "USD" ? "usd" : (j.currency === "both" || j.currency === "local" ? j.currency : "usd");
  function totalRows(j, q) {
    const m = curMode(j, q), r = [];
    if (m !== "local") r.push(["Total · USD", usdText(q)]);
    if (m !== "usd") r.push(["Total · " + q.cur, finalText(q)]);
    return r;
  }
  const metalsText = () => Q.parts.map((p, i) => ({ p, m: S.job.metals[i] })).filter(x => x.p.grams > 0).map(x => alloyLabel(x.m) + " " + fmt(x.p.grams, 3) + " g").join("  +  ");
  function sheetNode() {
    const j = S.job, q = Q, v = j.variant, full = v === "full", anyPrice = v !== "noPrice";
    const title = anyPrice ? (full ? "Quotation" : "Quotation Order") : "Production Sheet";
    const rows = stoneRows();
    const th = (t, r) => h("th", { class: r ? "r" : "" }, t);
    const table = h("div", { class: "table-scroll" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, th("Sr"), th("Type"), th("Shape / size"), th("Quality"), th("Qty", 1), th("Total ct", 1), full ? th("$/ct", 1) : null, full ? th("$ total", 1) : null)),
      h("tbody", null, rows.map((x, k) => h("tr", null, h("td", null, String(k + 1)), h("td", null, x.lc.type), h("td", null, shapeSizeText(x.lc)), h("td", null, full ? (x.lc.quality || "—") : (x.L.proposed || "—")),
        h("td", { class: "n" }, String(x.lc.pcs)), h("td", { class: "n" }, fmt(x.lc.total, 3)), full ? h("td", { class: "n" }, money(x.lc.ppc)) : null, full ? h("td", { class: "n" }, money(x.lc.amount)) : null))),
      h("tfoot", null, h("tr", null, h("td", { colspan: 4 }, "Totals"), h("td", { class: "n" }, String(q.pieces)), h("td", { class: "n" }, fmt(q.carats, 3)), full ? h("td") : null, full ? h("td", { class: "n" }, money(q.diamonds)) : null))));
    const kv = (k, val) => h("div", null, h("span", null, k), val || "—");
    let totals = null;
    if (full) totals = h("div", { class: "tot-list" }, componentList(q, j).map(([a, b]) => h("div", null, h("span", null, a), h("span", { class: "mono" }, money(b)))),
      curMode(j, q) === "local" ? null : h("div", null, h("span", null, "Gross total · USD"), h("span", { class: "mono" }, money(q.gross))),
      totalRows(j, q).map(([a, b]) => h("div", { class: "big" }, h("span", null, a), h("span", { class: "mono" }, b))));
    else if (v === "priceOnly") totals = h("div", { class: "tot-list" }, totalRows(j, q).map(([a, b]) => h("div", { class: "big" }, h("span", null, a), h("span", { class: "mono" }, b))));
    return h("div", { class: "sheet" },
      h("div", { class: "letterhead" }, h("div", null, h("div", { class: "tag" }, "Phoenix jewellery"), h("h3", null, title)),
        h("div", { class: "meta" }, h("div", null, "Job ", h("b", null, j.jobNo || "—"), "  ·  Item ", h("b", null, j.itemNo || "—")), h("div", null, "Quote ", h("b", null, j.stage || "Q1"), "  ·  ", j.date))),
      h("div", { class: "kv" }, kv("Customer", j.customer), kv("Designer", j.by), kv("Item size", j.itemSize), kv("Location", q.locCode), kv("Metal", metalsText())),
      IMG.cad.length ? h("div", { class: "imgrow" }, IMG.cad.slice(0, 4).map(u => h("img", { src: u, alt: "CAD render" }))) : null,
      table, totals, j.render ? h("p", { class: "hint" }, "3D render: " + j.render) : null, j.remarks ? h("p", { class: "hint" }, "Remarks: " + j.remarks) : null);
  }
  function quoteText() {
    const j = S.job, q = Q, v = j.variant, full = v === "full";
    const L = [(v === "noPrice" ? "PRODUCTION SHEET" : "QUOTATION") + "  Job " + (j.jobNo || "-") + "  Item " + (j.itemNo || "-") + "  " + (j.stage || "Q1"),
      "Customer " + (j.customer || "-") + "   Location " + q.locCode + "   Date " + j.date, "Metal: " + (metalsText() || "-"), "Stones:"];
    stoneRows().forEach((x, k) => L.push("  " + (k + 1) + ". " + x.lc.type + " " + shapeSizeText(x.lc) + " | " + (full ? (x.lc.quality || "-") : (x.L.proposed || "-")) + " | " + x.lc.pcs + " pcs | " + fmt(x.lc.total, 3) + " ct" + (full ? " | " + money(x.lc.ppc) + "/ct | " + money(x.lc.amount) : "")));
    if (full) { componentList(q, j).forEach(([a, b]) => L.push(a + ": " + money(b))); if (curMode(j, q) !== "local") L.push("Gross total (USD): " + money(q.gross)); totalRows(j, q).forEach(([a, b]) => L.push(a.replace(" · ", " (") + "): " + b)); L.push("SSP: " + q.code); }
    else if (v === "priceOnly") totalRows(j, q).forEach(([a, b]) => L.push(a.replace(" · ", " (") + "): " + b));
    if (j.remarks) L.push("Remarks: " + j.remarks);
    return L.join("\n");
  }
  const snapshot = () => ({ phoenix: 1, savedAt: Date.now(), job: clone(S.job) });
  function applySnapshot(s) { S.job = normaliseJob(clone(s.job)); ui.importInfo = null; mountAll(); }

  function openSaved() {
    const list = h("div", { class: "qlist" }, h("div", { class: "qrow" }, h("span", { class: "mute" }, "Loading...")));
    const paint = async () => {
      const q = await loadSynced(true);
      if (!q) { list.replaceChildren(h("div", { class: "qrow" }, h("span", { class: "mute" }, "The quote database is not available here. Open this page from claude.ai and sign in, or load a quote file below."))); return; }
      list.replaceChildren(...(q.length ? q.map(s => h("div", { class: "qrow" },
        h("div", { class: "t" }, h("b", null, quoteLabel(s)), h("span", null, (s.customer || "no customer") + " · synced " + new Date(s.savedAt).toLocaleString())),
        h("button", { class: "small-btn accent", type: "button", onclick: async () => { const bad = await openSynced(s); if (bad) msg.textContent = bad; else closeDialog(); } }, "Load"))) : [h("div", { class: "qrow" }, h("span", { class: "mute" }, "Nothing synced yet. Use Sync to DB in the Quotes section."))]));
    };
    paint();
    const paste = h("textarea", { class: "inp", id: uid("paste"), placeholder: "Paste quote JSON here (from Copy quote JSON in the preview)", "aria-label": "Quote JSON" });
    const msg = h("span", { class: "status-warn" });
    const loadText = text => {
      try {
        const o = JSON.parse(text);
        if (o && o.jobInfo && o.rows) throw new Error("jwy");
        const jb = o && o.job && Array.isArray(o.job.lines) ? o.job : o;
        if (!jb || !Array.isArray(jb.lines) || !Array.isArray(jb.metals)) throw new Error("bad");
        closeDialog(); applySnapshot({ job: jb });
      } catch (e) { msg.textContent = e.message === "jwy" ? "This is a JWY calculator quote. Open it in the JWY calculator." : "That is not a Phoenix quote."; }
    };
    const file = h("input", { type: "file", accept: ".json,application/json", hidden: true, "aria-label": "Quote file" });
    file.addEventListener("change", async () => { const f = file.files[0]; if (f) loadText(await f.text()); });
    openDialog("Load saved quote", h("div", null,
      h("h3", { class: "sec-h" }, "Synced to the database"), list,
      h("h3", { class: "sec-h", style: "margin-top:16px" }, "From text or file"), paste,
      h("div", { class: "toolbar", style: "margin-top:8px" }, h("button", { class: "btn", type: "button", onclick: () => loadText(paste.value) }, "Load pasted quote"), h("button", { class: "btn ghost", type: "button", onclick: () => file.click() }, "Choose file"), msg), file));
  }

  /* ---- order data import ---- */
  async function handleOrderFile(f) {
    if (!f) return;
    let text = "";
    try { text = await f.text(); } catch (e) { ui.importInfo = { error: "Could not read " + f.name + "." }; renderStatus(); return; }
    const res = parseOrderJson(text, CATALOG);
    if (!res.ok) { ui.importInfo = { error: res.why, file: f.name }; renderStatus(); return; }
    const r = res.job;
    const metals = [0, 1].map(i => Object.assign(blankMetal(), r.metals[i] || {}));
    S.job = normaliseJob(Object.assign({}, S.job, { by: r.by || S.job.by, jobNo: r.jobNo || "", itemNo: r.itemNo || "", itemSize: r.itemSize || "", remarks: r.remarks || "", itemType: r.itemType || "", subCategory: r.subCategory || "", metals, lines: r.lines.length ? r.lines : Array.from({ length: 5 }, blankLine), override: "", extraName: "", extraAmt: "" }));
    ui.importInfo = { file: f.name, jobNo: r.jobNo, stones: r.lines.length, warnings: res.warnings };
    mountAll();
    const [cad, ref] = await Promise.all([Promise.all(res.images.cad.map(u => compress(u))), Promise.all(res.images.ref.map(u => compress(u)))]);
    IMG.cad = cad.concat(IMG.cad); IMG.ref = ref.concat(IMG.ref); renderThumbs("cad"); renderThumbs("ref");
  }
  function renderStatus() {
    const i = ui.importInfo, bar = ui.statusBar;
    if (!i) { bar.hidden = true; bar.replaceChildren(); return; }
    bar.hidden = false;
    const head = i.error ? h("span", null, "Could not load ", h("b", null, i.file || "the file"), ": " + i.error)
      : h("span", null, "Loaded order data ", h("b", null, i.jobNo || i.file), " from " + i.file + " · " + i.stones + " stone line" + (i.stones === 1 ? "" : "s") + (i.warnings.length ? " · " + i.warnings.length + " to check" : ""));
    bar.replaceChildren(h("div", null, head, h("span", { class: "spacer" }), h("button", { type: "button", onclick: () => { ui.importInfo = null; renderStatus(); } }, "Dismiss"),
      !i.error && i.warnings.length ? h("ul", null, i.warnings.map(w => h("li", null, w))) : null));
  }

  /* ---- PDF, GATI, Drive, DB, email ---- */
  function filenameBase() {
    const j = S.job, parts = [j.jobNo, j.itemNo, j.stage].filter(Boolean);
    const base = (parts.length ? parts.join("_") : "quote").replace(/[^\w.\-]+/g, "-");
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return base + "_" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function makePdf(variant) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("The PDF library did not load.");
    return buildQuotePdf({ job: S.job, Q, images: IMG.cad, variant, alloyLabel });
  }
  function toBase64(buf) {
    const b = new Uint8Array(buf); let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function saveFile(filename, data) {
    const dl = await cap("downloads");
    if (!dl) throw new Error("Downloads are not available in this view.");
    try { return await dl.save({ filename, data }); }
    catch (e) { throw new Error(e && e.code === "declined" ? "Save cancelled." : ((e && e.message) || "Couldn't save the file.")); }
  }
  const doDownload = async variant => { await saveFile(filenameBase() + ".pdf", makePdf(variant).output("blob")); return "Saved"; };
  async function doGati() {
    if (!window.XLSX) throw new Error("The spreadsheet library did not load.");
    const { rows, flagged } = buildGatiRows(S.job, Q);
    if (!rows.length) throw new Error("Add at least one stone row before exporting.");
    const bytes = gatiWorkbookBytes(rows);
    await saveFile(filenameBase() + "_GATI.xlsx", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    return flagged > 0 ? "Downloaded -- " + flagged + " field(s) need review" : "Downloaded -- no flagged fields";
  }
  async function doDrive() {
    const mcp = await cap("mcp");
    if (!mcp) throw new Error("Google Drive is not available in this view.");
    const base = filenameBase();
    const content = toBase64(makePdf("full").output("arraybuffer"));
    try { await mcp.callTool("Google Drive", "create_file", { title: base + ".pdf", contentMimeType: "application/pdf", base64Content: content, disableConversionToGoogleType: true }); }
    catch (e) { throw new Error(mcpMessage(e, "Google Drive")); }
    return "Saved to Drive";
  }
  const safeId = s => String(s).replace(/[^A-Za-z0-9_\-.~:@+]/g, "-").slice(0, 190);
  async function doSync() {
    const db = await cap("db");
    if (!db) throw new Error("The quote database is not available here. Open this page from claude.ai and sign in.");
    const j = S.job, unique = !!(j.jobNo && j.itemNo);
    const ref = db.collection("quotes").doc(safeId(unique ? [j.jobNo, j.itemNo, j.stage || ""].join("_") : filenameBase()));
    if (unique) {
      const ex = await ref.get();
      if (ex.exists) throw new Error("Please update your quotation stage before saving -- " + (j.stage || "this stage") + " already exists for Job " + j.jobNo + " / Item " + j.itemNo + ".");
    }
    const doc = { jobNo: j.jobNo || "", itemNo: j.itemNo || "", stage: j.stage || "", customer: j.customer || "", designer: j.by || "", date: j.date || "", tier: j.tier, gross: Q.gross, cur: curMode(j, Q) === "local" ? Q.cur : "USD", total: curMode(j, Q) === "local" ? (Q.finalLocal == null ? 0 : Q.finalLocal) : Q.finalUsd, savedAt: Date.now(), filenameBase: filenameBase(), json: JSON.stringify(snapshot()) };
    if (db.wantsPdf) doc.pdfBase64 = toBase64(makePdf("full").output("arraybuffer")); // deployed database archives the PDF next to the JSON
    await ref.set(doc);
    ui.synced = null;
    return "Synced";
  }
  function emailHtml() {
    const j = S.job, esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const ref = [j.jobNo ? "Job " + j.jobNo : null, j.itemNo ? "Item " + j.itemNo : null, j.stage || null].filter(Boolean).join(" · ");
    return '<div style="font-family:Georgia,\'Times New Roman\',serif;max-width:480px;margin:0 auto;color:#241B1E;"><div style="background:#241B1E;padding:20px 24px;border-bottom:3px solid #9C4A63;"><div style="color:#D8B7C2;font-size:11px;">Fine Jewelry Manufacturing</div></div><div style="padding:28px 24px;">' +
      '<p style="font-size:14px;line-height:1.6;">Dear ' + esc(j.customer || "there") + ',</p><p style="font-size:14px;line-height:1.6;">Thank you for the opportunity to quote your piece. Please find your quotation attached as a PDF.</p>' +
      (ref ? '<div style="background:#FBEEF2;border-radius:6px;padding:14px 16px;margin:20px 0;font-size:13px;"><div style="color:#6E2F42;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.5px;margin-bottom:6px;">Job Reference</div><div>' + esc(ref) + "</div></div>" : "") +
      '<p style="font-size:14px;line-height:1.6;">If you have any questions about this quotation, or would like to discuss adjustments, please don\'t hesitate to reach out.</p><p style="font-size:14px;line-height:1.6;margin-top:24px;">Warm regards,</p></div>' +
      '<div style="padding:14px 24px;border-top:1px solid #F3DCE3;font-size:10.5px;color:#8B7680;">This quotation is an internal reference and subject to final confirmation.</div></div>';
  }
  async function doEmail(variant, to) {
    const mcp = await cap("mcp");
    if (!mcp) throw new Error("Gmail is not available in this view.");
    const base = filenameBase(), j = S.job;
    const content = toBase64(makePdf(variant).output("arraybuffer"));
    try {
      await mcp.callTool("Gmail", "send_message", { to: [to], subject: "Your Quotation — " + (j.jobNo || base), body: "Please find your quotation attached as a PDF.", htmlBody: emailHtml(), attachments: [{ content, filename: base + ".pdf", mimeType: "application/pdf" }] });
    } catch (e) { throw new Error(mcpMessage(e, "Gmail")); }
    return "Sent";
  }

  /* ---- 05 quotes ---- */
  function buildQuotes() {
    const j = S.job;
    const stage = bind(h("input", { class: "inp-sm", style: "width:52px;text-align:center;font-weight:600", placeholder: "Q1", id: uid("stage"), "aria-label": "Quote stage", title: "Quote stage (Q1, Q2, Revised, etc.). Used in file names and every save action." }), j, "stage");
    const variantOpts = () => [["full", "Full price"], ["priceOnly", "Price only"], ["noPrice", "No price"]].map(([v, t]) => h("option", { value: v }, t));
    const variant = h("select", { class: "inp-sm", style: "width:100px", id: uid("variant"), "aria-label": "Print variant" }, variantOpts()); bind(variant, j, "variant");
    const currencySel = h("select", { class: "inp-sm", style: "width:112px", id: uid("currency"), "aria-label": "PDF currency", title: "Currency shown on the printed PDF, preview and email" },
      [["both", "Normal (AUD + USD)"], ["local", "AUD only"], ["usd", "USD only"]].map(([v, t]) => h("option", { value: v }, t))); bind(currencySel, j, "currency");
    const div = () => h("div", { class: "divider-v" });
    const status = () => h("span", { class: "status-ok", role: "status" });
    const act = (label, busyLabel, fn, cls) => {
      const btn = h("button", { class: cls || "small-btn accent", type: "button" }, label), st = status();
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = busyLabel; flash(st, "", 0);
        try { const m = await fn(); st.className = "status-ok"; flash(st, m.startsWith("Downloaded -- ") && !m.includes("no flagged") ? m : "✓ " + m, 6000); st.title = m; if (m.includes("need review")) st.className = "status-warn"; }
        catch (e) { st.className = "status-warn"; flash(st, (e && e.message) || "Couldn't finish", 0); }
        btn.disabled = false; btn.textContent = label;
      });
      return [btn, st];
    };
    const [dl, dlSt] = act("Download", "Generating…", () => doDownload(j.variant), "toggle-btn");
    dl.setAttribute("aria-pressed", "true");
    const pv = h("button", { class: "toggle-btn", type: "button", title: "Preview without downloading", "aria-pressed": "true", "aria-label": "Preview", onclick: () => openPreview() }, "👁 Preview");
    const [sync, syncSt] = act("Sync to DB", "Saving…", doSync);
    const [drive, driveSt] = act("Save to Drive", "Saving…", doDrive);
    const [gati, gatiSt] = act("Export to GATI", "Building…", doGati);

    // Email
    const emailBox = h("span", { class: "email-box", hidden: true });
    const to = h("input", { type: "email", class: "inp-sm", placeholder: "Recipient email", "aria-label": "Recipient email", style: "width:170px", autocomplete: "off" });
    const ev = h("select", { class: "inp-sm", style: "width:100px", "aria-label": "Email variant" }, variantOpts());
    const emSt = h("span", { class: "status-ok", role: "status" });
    const send = h("button", { class: "small-btn accent", type: "button" }, "Send");
    const sendGo = async () => {
      const addr = to.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { emSt.className = "status-warn"; flash(emSt, "Enter a valid email address.", 4000); return; }
      send.disabled = true; send.textContent = "Sending…"; flash(emSt, "", 0);
      try { await doEmail(ev.value, addr); emSt.className = "status-ok"; flash(emSt, "✓ Sent", 4000); }
      catch (e) { emSt.className = "status-warn"; flash(emSt, (e && e.message) || "Couldn't send", 0); }
      send.disabled = false; send.textContent = "Send";
    };
    twoStep(send, "send email", sendGo);
    const emailBtn = h("button", { class: "small-btn", type: "button", onclick: () => { emailBox.hidden = false; emailBtn.hidden = true; to.focus(); } }, "✉ Email");
    emailBox.append(to, ev, send, h("button", { class: "small-btn plain", type: "button", "aria-label": "Close email", onclick: () => { emailBox.hidden = true; emailBtn.hidden = false; flash(emSt, "", 0); } }, "×"), emSt);

    return h("div", { class: "card" },
      h("div", { class: "toolbar" }, sectionLabel("05", "Quotes"), stage, div(), variant, currencySel, dl, dlSt, pv, div(), sync, syncSt, drive, driveSt, gati, gatiSt, emailBtn, emailBox),
      h("p", { class: "hint" }, WEB
        ? "Sync to DB saves the PDF and the quote to the team database. Save to Drive uploads the PDF to the shared Drive folder. Email sends the PDF to your customer. The first save or email asks for the team access key."
        : "Sync to DB saves the quote to this page's shared database. Save to Drive and Email use your connected Google Drive and Gmail. Sync to DB, Save to Drive and Email work only when the page is opened from claude.ai."));
  }
  function openPreview() {
    const host = h("div"), st = h("span", { class: "status-ok" });
    openDialog("Quote preview", h("div", null, sheetNode(),
      h("div", { class: "toolbar", style: "margin-top:14px" },
        h("button", { class: "btn", type: "button", onclick: async () => { const ok = await copyText(quoteText(), host); flash(st, ok ? "Copied" : "Copy blocked, select the text below", 6000); } }, "Copy as text"),
        h("button", { class: "btn ghost", type: "button", onclick: async () => { const ok = await copyText(JSON.stringify(snapshot()), host); flash(st, ok ? "Quote JSON copied" : "Copy blocked, select the text below", 6000); } }, "Copy quote JSON"), st), host), true);
  }

  /* ---- 06 breakdown ---- */
  function buildBreakdown() {
    const j = S.job, bk = ui.bk = {};
    bk.grid = h("div", { class: "breakup-grid" });
    bk.ov = bind(h("input", { type: "number", step: "1", class: "inp-sm", id: uid("ov"), "aria-label": "Override final price" }), j, "override");
    bk.ovLab = h("span", { class: "lab2" });
    bk.ovU = bind(h("input", { type: "number", step: "1", class: "inp-sm", id: uid("ovu"), "aria-label": "Override final price in USD" }), j, "overrideUsd");
    bk.ovULab = h("span", { class: "lab2" }, "Override final price (USD)");
    bk.ovClear = h("button", { class: "small-btn plain", type: "button", onclick: () => { j.override = ""; j.overrideUsd = ""; bk.ov.value = ""; bk.ovU.value = ""; update(); } }, "Clear override");
    bk.exClear = h("button", { class: "small-btn plain", type: "button", onclick: () => { j.extraName = ""; j.extraAmt = ""; bk.exName.value = ""; bk.exAmt.value = ""; update(); } }, "Clear");
    bk.exName = bind(h("input", { type: "text", class: "inp-sm", placeholder: "e.g. Rush fee", style: "width:130px", id: uid("exn"), "aria-label": "Additional charge name" }), j, "extraName");
    bk.exAmt = bind(h("input", { type: "number", step: "1", class: "inp-sm", placeholder: "0.00 USD", style: "width:100px", id: uid("exa"), "aria-label": "Additional charge amount in USD" }), j, "extraAmt");
    bk.g = h("div", { class: "v" }); bk.l = h("div", { class: "v" }); bk.ll = h("div", { class: "l" }); bk.u = h("div", { class: "v" }); bk.ul = h("div", { class: "l" }); bk.fx = h("div", { class: "fx" });
    bk.code = h("span", { class: "ssp-code" });
    return h("div", { class: "card" }, sectionLabel("06", "Quote breakdown"), bk.grid, h("div", { class: "divider" }),
      h("div", { class: "adj" }, bk.ovLab, bk.ov, bk.ovULab, bk.ovU, bk.ovClear, h("div", { class: "divider-v" }), h("span", { class: "lab2" }, "Additional charges"), bk.exName, bk.exAmt, bk.exClear),
      h("div", { class: "totals-grid two" },
        h("div", { class: "tot" }, h("div", { class: "l" }, "Gross total · USD"), bk.g),
        h("div", { class: "tot main" }, bk.ll, bk.l, bk.fx)),
      h("div", { class: "totals-grid two" },
        h("div", { class: "tot main" }, bk.ul, bk.u)),
      h("div", { class: "ssp-row" }, h("span", null, "SSP code"), bk.code, h("span", null, "The gross total written with your price code letters.")));
  }
  function paintBreakdown(q) {
    const j = S.job, bk = ui.bk;
    const pct = v => (q.gross > 0 ? v / q.gross * 100 : 0);
    bk.grid.replaceChildren(...componentList(q, j).map(([label, v]) => h("div", { class: "metric" }, h("div", { class: "metric-tab" }), h("div", { class: "metric-label" }, label), h("div", { class: "metric-value" }, money(v)), h("div", { class: "metric-pct" }, fmt(pct(v), 1) + "% of total"))));
    bk.ovLab.textContent = "Override final price (" + q.cur + ")";
    bk.ov.placeholder = "calculated: " + (q.local == null ? "no rate" : fmt(q.local, 0));
    bk.ovU.placeholder = "calculated: " + fmt(q.usd, 0);
    bk.ovULab.hidden = bk.ovU.hidden = q.cur === "USD";
    bk.ul.textContent = "Total · USD" + (q.hasOverride || q.hasOverrideUsd ? "  (calculated: " + money(q.usd) + ")" : "");
    bk.u.textContent = usdText(q);
    bk.ovClear.hidden = !(q.hasOverride || q.hasOverrideUsd); bk.exClear.hidden = !(q.extra > 0 || j.extraName);
    bk.g.textContent = money(q.gross);
    bk.ll.textContent = q.locCode + " total · " + q.cur + (q.hasOverride ? "  (calculated: " + (q.local == null ? "no rate" : localMoney(q.local, q.cur)) + ")" : "");
    bk.l.textContent = finalText(q);
    bk.fx.textContent = q.cur === "USD" ? "" : "fx rate " + fmt(q.rate, 3) + " (" + q.cur + " → USD)";
    bk.code.textContent = q.code || "—";
  }

  /* ---- 07 remarks ---- */
  function buildRemarks() {
    return h("div", { class: "card" }, sectionLabel("07", "Remarks"), bind(h("textarea", { class: "inp", id: uid("rem"), placeholder: "Internal notes, client instructions, or anything worth flagging on this job...", "aria-label": "Remarks" }), S.job, "remarks"));
  }

  /* ---- page ---- */
  function buildJob() {
    ui.rows = []; ui.thumbs = {}; ui.metalNotes = [];
    const j = S.job;
    return h("div", null, buildDetails(), buildTiers(), buildImages(), buildRateBook(),
      h("div", { class: "grid2" }, metalCard("Primary metal", j.metals[0], 0), metalCard("Secondary metal", j.metals[1], 1)),
      buildStones(), buildQuotes(), buildBreakdown(), buildRemarks());
  }
  function mountAll() {
    idc = 0; closeDialog();
    ui.main.replaceChildren(buildJob());
    renderStatus(); update();
  }
  function shell() {
    const root = document.getElementById("app");
    ui.sub = h("div", { class: "brand-sub" });
    const orderFile = h("input", { type: "file", accept: ".json,application/json", hidden: true, "aria-label": "Order data file" });
    orderFile.addEventListener("change", () => { const f = orderFile.files[0]; orderFile.value = ""; handleOrderFile(f); });
    const clear = h("button", { class: "top-btn", type: "button" }, "Clear form");
    twoStep(clear, "clear everything", () => { S.job = jobBase(); IMG.cad = []; IMG.ref = []; ui.importInfo = null; mountAll(); });
    ui.statusBar = h("div", { class: "status-bar", hidden: true });
    ui.main = h("main", { class: "shell pane" });
    root.replaceChildren(
      h("div", { class: "topbar" }, h("div", { class: "topbar-in" },
        h("div", { class: "brand" }, h("div", { class: "logo-box" }, h("img", { class: "logo-img", src: LOGOS.white, alt: "Made with Love" })), h("div", null, h("div", { class: "brand-title" }, "Phoenix Calculator"), ui.sub)),
        h("div", { class: "top-actions" }, clear,
          h("button", { class: "top-btn", type: "button", onclick: openSaved }, "Load saved quote", h("span", { class: "info", title: "Reload a quote synced to the database, or load a quote file." }, "ⓘ")),
          h("button", { class: "top-btn", type: "button", onclick: () => orderFile.click() }, "Load order data", h("span", { class: "info", title: "Choose the .json exported by the CAD Order Form (Export Order Data). Job details, metals, stones and images are filled in." }, "ⓘ")), orderFile))),
      ui.statusBar, ui.main);
  }

  function update() {
    const j = S.job, R = S.rates;
    Q = quote(j, R, CATALOG);
    Q.lines.forEach((lc, i) => paintRow(i, lc));
    ui.fPcs.textContent = fmt(Q.pieces, 0); ui.fCt.textContent = fmt(Q.carats, 3); ui.fDia.textContent = money(Q.diamonds);
    ui.totalG.textContent = fmt(Q.grams, 3);
    ui.metalNotes.forEach((n, k) => { const m = j.metals[k]; const g = num(m.grams); n.textContent = m.metal ? money(metalPerGm(m.metal, m.color, R)) + " /gm" + (g > 0 ? "  ·  " + money(Q.parts[k].cost) : "") : ""; });
    paintTiers(Q); paintNotes(Q); paintBreakdown(Q); paintChips();
    if (!ui.manualRates) paintRateTable();
    ui.sub.textContent = "Job — " + (j.jobNo || "") + (j.itemNo ? " · " + j.itemNo : "");
    save();
  }

  shell();
  mountAll();
})();

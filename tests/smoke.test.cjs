const { JSON: _j } = { JSON };
const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../build/phoenix-artifact.html", "utf8").replace(/<link[^>]*>/, "");
const errors = [], calls = { saves: [], mcp: [] };
const store = new Map();
const mkDb = () => ({
  collection(name) {
    const q = { _o: null, _l: 100, orderBy(f, d) { q._o = [f, d]; return q; }, limit(n) { q._l = n; return q; },
      async get() { let docs = [...store.entries()].map(([id, data]) => ({ id, exists: true, data: () => data })); if (q._o) docs.sort((a, b) => (b.data()[q._o[0]] || 0) - (a.data()[q._o[0]] || 0)); return { docs: docs.slice(0, q._l), size: docs.length, empty: !docs.length }; },
      doc(id) { return { id, async get() { return store.has(id) ? { id, exists: true, data: () => store.get(id) } : { id, exists: false, data: () => undefined }; }, async set(d) { store.set(id, d); } }; } };
    return q;
  }
});
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://example.test/",
  beforeParse(w) {
    w.addEventListener("error", e => errors.push(e.message)); w.Element.prototype.scrollIntoView = function () {};
    w.claude = { use: async name => ({
      downloads: { save: async r => { calls.saves.push(r); return { status: "saved" }; } },
      db: mkDb(),
      mcp: { callTool: async (server, tool, input) => { calls.mcp.push({ server, tool, input }); return { payload: { id: "x" } }; } }
    }[name] || null) };
  } });
const w = dom.window, d = w.document;
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? "PASS " : "FAIL ") + n); };
const text = () => d.body.textContent;
const btn = t => [...d.querySelectorAll("button")].find(b => b.textContent.trim() === t || b.textContent.includes(t));
const fire = (el, v) => { el.value = v; el.dispatchEvent(new w.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); if (el.tagName === "SELECT") el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const q = s => d.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const readBuf = blob => new Promise(res => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.readAsArrayBuffer(blob); });

(async () => {
  ok("no script errors on load", errors.length === 0);
  ok("brand + sub", text().includes("Phoenix Calculator") && text().includes("Job — s01294"));
  const logo = q(".logo-box img");
  ok("header shows the Made with Love logo (no P mark)", !!logo && logo.alt === "Made with Love" && /^data:image\/png;base64,/.test(logo.getAttribute("src")) && !q(".mark"));
  ok("sections 01..07", ["Job details", "Tier pricing", "Rate book", "Stone schedule", "Quotes", "Quote breakdown", "Remarks"].every(t => text().includes(t)));
  ok("no tabs", !q('[role=tablist]'));
  ok("gross 1,609 and AUD 2,300", text().includes("$1,609.00") && text().includes("AUD $2,300.00"));
  ok("SSP code JIXT", text().includes("JIXT"));
  console.log("-- removed items");
  ok("no CAD type field", !text().includes("CAD type") && !text().includes("CAD ·"));
  ok("no pricing model / itemised", !text().includes("Pricing model") && !text().includes("Itemised"));
  ok("no duty total or setting tiles", !text().includes("With ") || !/With \d+% duty/.test(text()));
  ok("no setting column or tiles", !text().includes("$ setting") && !text().includes("Setting (reference)"));
  ok("no rounding select", ![...d.querySelectorAll("option")].some(o => o.textContent === "Exact sheet values"));
  const loc = [...d.querySelectorAll("select")].find(s => [...s.options].some(o => o.value === "WSSY"));
  ok("location has only WSSY, 0% duty", loc.options.length === 1 && loc.options[0].textContent === "WSSY · AUD · 0% duty");
  ok("breakdown tiles are Metal, Casting, Diamonds only", [...d.querySelectorAll(".metric-label")].map(e => e.textContent).join("|") === "Metal|Casting · Tier 1|Diamonds");
  ok("three total tiles: gross USD, AUD, USD", d.querySelectorAll(".totals-grid .tot").length === 3);
  const curSel = d.querySelector('select[aria-label="PDF currency"]');
  ok("PDF currency selector offers Normal, AUD only, USD only, default USD only", !!curSel && [...curSel.options].map(o => o.value).join() === "both,local,usd" && curSel.value === "usd");
  console.log("-- tiers");
  q('.tier[data-tier="Tier 3"]').click();
  ok("Tier 3 -> $1,669", text().includes("Casting · Tier 3") && text().includes("$1,669.00"));
  q('.tier[data-tier="Tier 1"]').click();
  console.log("-- custom entries");
  const row = i => d.querySelectorAll("table.stones tbody tr")[i];
  // add a row to play with (row 10)
  btn("+ Add custom stone row").click();
  let r = row(9);
  const typeSel = r.querySelector('[data-k="type"]'); fire(typeSel, "__CUSTOM__");
  r = row(9);
  ok("Type custom: text box in same cell", !!r.querySelector('input[data-k="typeText"]') && !r.querySelector('select[data-k="type"]'));
  fire(r.querySelector('input[data-k="typeText"]'), "Moissanite");
  r = row(9); fire(r.querySelector('[data-k="shape"]'), "__CUSTOM__");
  r = row(9);
  ok("Shape custom: text box + size text box", !!r.querySelector('input[data-k="shapeText"]') && !!r.querySelector('input[data-k="sizeText"]'));
  fire(r.querySelector('input[data-k="shapeText"]'), "Kite"); fire(row(9).querySelector('input[data-k="sizeText"]'), "5 x 3 mm");
  r = row(9);
  ok("Quality box is free text for a custom type", !!r.querySelector('input[data-k="qualityText"]'));
  fire(r.querySelector('input[data-k="qualityText"]'), "F VS1");
  fire(r.querySelector('[aria-label="Line 10 weight per piece"]'), "0.1"); fire(r.querySelector('[aria-label="Line 10 pieces"]'), "2"); fire(r.querySelector('[aria-label="Line 10 price per carat"]'), "250");
  ok("custom row priced: 2 x 0.1 x 250 = $50", row(9).textContent.includes("$50.00") && text().includes("$1,659.00"));
  ok("no price warning once $/ct entered", q(".warn-banner").hidden);
  row(9).querySelector('.cust-back[aria-label*="custom type"]').click();
  ok("back button returns the Type list", !!row(9).querySelector('select[data-k="type"]'));
  // size custom on a real shape, quality custom on Mined
  btn("+ Add custom stone row").click(); r = row(10);
  fire(r.querySelector('[data-k="shape"]'), "Round"); r = row(10);
  fire(r.querySelector('[data-k="size"]'), "__CUSTOM__"); r = row(10);
  ok("Size custom on a real shape: text box in the Size cell", !!r.querySelector('input[data-k="sizeText"]') && !r.querySelector('input[data-k="shapeText"]'));
  fire(r.querySelector('[data-k="quality"]'), "__CUSTOM__"); r = row(10);
  ok("Quality custom on Mined: text box", !!r.querySelector('input[data-k="qualityText"]'));
  fire(r.querySelector('input[data-k="qualityText"]'), "G VS2"); fire(row(10).querySelector('[aria-label="Line 11 pieces"]'), "1"); fire(row(10).querySelector('[aria-label="Line 11 weight per piece"]'), "0.5");
  ok("custom quality needs a $/ct", !q(".warn-banner").hidden && q(".warn-banner").textContent.includes("custom quality"));
  // clean up the two test rows
  row(10).querySelector(".clr").click(); row(9).querySelector(".clr").click();
  ok("test rows removed", d.querySelectorAll("table.stones tbody tr").length === 9);

  console.log("-- preview");
  btn("Preview").click();
  ok("preview opens with Quotation and no duty line", !!q(".dialog .sheet") && q(".dialog").textContent.includes("Quotation") && !/duty/.test(q(".dialog").textContent));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));

  console.log("-- Download (PDF)");
  btn("Download").click(); await wait(800);
  const pdf = calls.saves.find(s => s.filename.endsWith(".pdf"));
  ok("Download offers a .pdf named from job + stage", !!pdf && /^s01294_Q1_\d{8}-\d{6}\.pdf$/.test(pdf.filename));
  if (pdf) {
    const b = new Uint8Array(await readBuf(pdf.data)); ok("PDF bytes start with %PDF and are non-trivial", String.fromCharCode(...b.slice(0, 4)) === "%PDF" && b.length > 2000);
    let raw = ""; for (let i = 0; i < b.length; i += 0x8000) raw += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    ok("PDF carries the logo image", raw.includes("/Subtype /Image"));
  }
  console.log("-- Export to GATI");
  btn("Export to GATI").click(); await wait(800);
  const gx = calls.saves.find(s => s.filename.endsWith("_GATI.xlsx"));
  ok("GATI export offers an .xlsx", !!gx);
  if (gx) {
    const wb = w.XLSX.read(new Uint8Array(await readBuf(gx.data)), { type: "array" });
    const rows = w.XLSX.utils.sheet_to_json(wb.Sheets["GATI Import"], { header: 1 });
    ok("GATI sheet has all 214 columns", rows[0].length === 214 && rows[0][0] === "SrNo" && rows[0][213] === "JewelryColor");
    ok("GATI has one data row per active stone line (1 active row)", rows.length === 2);
    ok("GATI first row carries metal code G18YG and net wt 6.3", rows[1][rows[0].indexOf("MItemCode")] === "G18YG" && rows[1][rows[0].indexOf("NetWt")] === 6.3);
  }
  console.log("-- Sync to DB");
  // job has no item # so key is filename-based; give it an item # and sync twice
  fire([...d.querySelectorAll("input")].find(i => i.placeholder === "e.g. B00630"), "B00630");
  store.clear();
  btn("Sync to DB").click(); await wait(200);
  ok("Synced doc has json snapshot and totals", store.size === 1 && JSON.parse([...store.values()][0].json).job.jobNo === "s01294" && [...store.values()][0].gross === 1609);
  btn("Sync to DB").click(); await wait(200);
  ok("Second sync at same stage is refused with the JWY message", /update your quotation stage/.test(text()));
  fire(q('input[aria-label="Quote stage"]'), "Q2"); btn("Sync to DB").click(); await wait(200);
  ok("Bumping the stage to Q2 syncs a second doc", store.size === 2);
  console.log("-- Save to Drive");
  btn("Save to Drive").click(); await wait(800);
  const dv = calls.mcp.find(c => c.tool === "create_file");
  ok("Drive call: Google Drive create_file with a PDF", !!dv && dv.server === "Google Drive" && dv.input.contentMimeType === "application/pdf" && dv.input.title.endsWith(".pdf") && dv.input.base64Content.startsWith("JVBERi"));
  console.log("-- Email");
  btn("✉ Email").click();
  const to = q('input[type=email]'); fire(to, "not-an-email");
  const send = btn("Send"); send.click(); send.click(); await wait(100);
  ok("bad address is rejected, nothing sent", !calls.mcp.some(c => c.tool === "send_message") && /valid email/.test(text()));
  fire(to, "client@example.com"); btn("Send").click(); ok("first click only asks to confirm", !calls.mcp.some(c => c.tool === "send_message"));
  btn("Click again").click(); await wait(800);
  const em = calls.mcp.find(c => c.tool === "send_message");
  ok("Email: Gmail send_message with PDF attached", !!em && em.server === "Gmail" && em.input.to[0] === "client@example.com" && em.input.attachments[0].mimeType === "application/pdf" && em.input.attachments[0].content.startsWith("JVBERi") && /Your Quotation/.test(em.input.subject));
  console.log("-- search + load");
  const search = q('input[type=search]'); search.dispatchEvent(new w.Event("focus")); await wait(50); fire(search, "s01294"); await wait(100);
  ok("search finds the synced quote", q(".search-res") && !q(".search-res").hidden && q(".search-res").textContent.includes("s01294"));
  console.log("-- order import");
  const order = { JobNo: "4376", ItemNo: "S123", ItemType: "Ring", "CAD Designer": "Sudip", "Metal Type 1": "18KT", "Metal Col 1": "WG", "Metal 1 Weight": "5.53", _RAW_STONES: [{ Shape: "Round", Stone: "Mined", AvgWt: "0.005", Qty: "10" }, { Shape: "Kite", Stone: "Moissanite", AvgWt: "0.1", Qty: "2" }] };
  const inp = [...d.querySelectorAll('input[type=file]')].find(i => i.getAttribute("aria-label") === "Order data file");
  Object.defineProperty(inp, "files", { value: [{ name: "order.json", text: async () => JSON.stringify(order) }] }); inp.dispatchEvent(new w.Event("change"));
  await wait(300);
  ok("order import applied job # and status bar", text().includes("Job — 4376") && text().includes("Loaded order data"));
  ok("unknown stone type/shape land as custom boxes", !!row(1).querySelector('input[data-k="typeText"]') && !!row(1).querySelector('input[data-k="shapeText"]') && row(1).querySelector('input[data-k="typeText"]').value === "Moissanite");
  const clr = btn("Clear form"); clr.click(); clr.click();
  ok("clear form empties job", text().includes("Job — ") && !text().includes("Job — 4376"));
  ok("no runtime errors", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  process.exit(fails ? 1 : 0);
})();

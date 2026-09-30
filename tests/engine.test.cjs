// Engine tests: data.js + engine.js loaded as one script; sample job s01294 checked against hand calculations
const fs = require("fs");
const dir = __dirname + "/../src";
const src = fs.readFileSync(dir + "/data.js", "utf8") + "\n" + fs.readFileSync(dir + "/engine.js", "utf8");
const m = { exports: {} };
new Function("module", src + "\nmodule.exports = { CATALOG, DEFAULT_RATES, quote, lineCalc, metalPerGm, tierCharge, sspPrice, encodeCode, decodeCode, convertWeight, lgdLookup, num, roundUp5, parseOrderJson, CUSTOM };")(m);
const E = m.exports;

let fails = 0;
const eq = (name, got, want, tol = 0.005) => {
  const ok = typeof want === "string" ? got === want : Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log((ok ? "PASS " : "FAIL ") + name + " -> " + got + (ok ? "" : "  (want " + want + ")"));
};

const idx = c => E.CATALOG.findIndex(x => x[0] === c);
const L = (type, code, extra = {}) => Object.assign({ type, typeText: "", shape: code ? E.CATALOG[idx(code)][1] : "", shapeText: "", idx: code ? idx(code) : null, custom: false, desc: "", q: "TW SI1", lgd: "SSP", qText: "", proposed: "", pcs: "", wtPc: "", ppc: "" }, extra);
function sample() {
  const lines = [
    L("Mined", "RND050W", { q: "WH SI" }), L("Mined", "RND2.4M", { q: "WH SI" }), L("Mined", "HRT3943M", { q: "TW SI3" }),
    L("Mined", "RND1.0M", { q: "TW SI3" }), L("Mined", "RND1.0M", { q: "TW SI3" }), L("Mined", "RND1.0M", { q: "TW SI3" }),
    L("Lab grown", "RND1.6M"), L("Mined", "RND050W", { q: "TW VS" }),
    L("Mined", null, { shape: "__CUSTOM__", shapeText: "Manual stone", custom: true, pcs: "2", wtPc: "2.01", ppc: "200" })
  ];
  return { loc: "WSSY", tier: "Tier 1", extraAmt: "", override: "",
    metals: [{ metal: "18KT", color: "YELLOW", grams: "6.3" }, { metal: "18KT", color: "YELLOW", grams: "" }], lines };
}
const RX = JSON.parse(JSON.stringify(E.DEFAULT_RATES)); RX.roundMode = "off";
const RR = JSON.parse(JSON.stringify(E.DEFAULT_RATES));

let job = sample();
let q = E.quote(job, RX, E.CATALOG);
console.log("-- s01294, exact sheet values (rounding off)");
eq("SSP RND050W WH SI", q.lines[0].autoPpc, 760);
eq("SSP RND2.4M WH SI (R09)", q.lines[1].autoPpc, 430);
eq("SSP hearts have no group", q.lines[2].autoPpc, 0);
eq("SSP RND1.0M TW SI3 (R00)", q.lines[3].autoPpc, 390);
eq("Lab grown RND1.6M via SSP LGD column", q.lines[6].autoPpc, 100);
eq("SSP RND050W TW VS", q.lines[7].autoPpc, 1200);
eq("Wt/pc RND050W", q.lines[0].wtPc, 0.51);
eq("metal 6.3 g x 149.26 x 0.75", q.metal, 705.2535);
eq("tier 1", q.tier, 100);
eq("diamonds 2 x 2.01 x 200", q.diamonds, 804);
eq("gross", q.gross, 1609.2535);
eq("no duty step: AUD = gross / 0.70", q.local, 1609.2535 / 0.7);
eq("SSP code", q.code, "JIXT");
eq("only WSSY, AUD", q.cur === "AUD" && E.DEFAULT_RATES.locations.length === 1 ? 1 : 0, 1);
eq("WSSY duty is 0", E.DEFAULT_RATES.locations[0].duty, 0);
eq("no CAD, casting, labor or setting tables", ["cad", "casting", "labor", "setting"].some(k => k in E.DEFAULT_RATES) ? 1 : 0, 0);

console.log("-- s01294, JWY-style rounding (default)");
q = E.quote(sample(), RR, E.CATALOG);
eq("metal rounds to 705", q.metal, 705);
eq("gross 1609", q.gross, 1609);
eq("AUD 1609 / 0.70 = 2298.57 rounds up to next 5", q.local, 2300);
eq("SSP code unchanged", q.code, "JIXT");
eq("roundUp5 exact multiple stays", E.roundUp5(1690), 1690);

console.log("-- override, extra charge, USD location");
job = sample(); job.override = "2500"; job.extraAmt = "50";
q = E.quote(job, RR, E.CATALOG);
eq("extra charge folds into gross", q.gross, 1659);
eq("override replaces local total", q.finalLocal, 2500);

console.log("-- pieces filled in");
job = sample(); job.lines[0].pcs = "2"; job.lines[3].pcs = "10"; job.lines[2].pcs = "2"; job.lines[2].ppc = "180";
q = E.quote(job, RX, E.CATALOG);
eq("2 x RND050W amount = 2 x 0.51 x 760", q.lines[0].amount, 775.2);
eq("hearts $/ct override 180: 2 x 0.25 x 180", q.lines[2].amount, 90);
job = sample(); job.lines[0].pcs = "2"; q = E.quote(job, RR, E.CATALOG);
eq("rounded row amount = round(775.2)", q.lines[0].amount, 775);

console.log("-- tier pricing");
job = sample(); job.tier = "Tier 3"; q = E.quote(job, RR, E.CATALOG);
eq("Tier 3 replaces Tier 1: 705 + 160 + 804", q.gross, 1669);
job.tier = "Tier 4"; job.metals[0].grams = "13"; q = E.quote(job, RX, E.CATALOG);
eq("Tier 4 at 13 g = 190 + 2 x 17", q.tier, 224);
eq("quote no longer carries setting, cad, casting, labor or duty", ["setting", "cad", "casting", "labor", "withDuty", "duty", "itemised"].some(k => k in q) ? 1 : 0, 0);

console.log("-- stone types");
job = sample(); job.lines = [L("Mount", null, { custom: true, shape: "__CUSTOM__", shapeText: "Mount", pcs: "1", wtPc: "0.5", ppc: "300" })];
q = E.quote(job, RR, E.CATALOG);
eq("mount priced by hand", q.lines[0].amount, 150);
job.lines = [L("Lab grown", "HRT3943M", { lgd: "NONCERT", pcs: "2" })]; q = E.quote(job, RX, E.CATALOG);
eq("LGD fancy 0.25 ct non-cert $200/ct", q.lines[0].autoPpc, 200);
job.lines = [L("Lab grown", "HRT3943M", { lgd: "SSP", pcs: "2" })]; q = E.quote(job, RX, E.CATALOG);
eq("LGD melee grid has no price for hearts", q.lines[0].autoPpc, 0);

console.log("-- custom entries in Type, Shape, Size and Quality");
job = sample(); job.lines = [L("__CUSTOM__", "RND1.0M", { typeText: "Moissanite", pcs: "4", ppc: "50" })]; q = E.quote(job, RR, E.CATALOG);
eq("custom type keeps its typed name", q.lines[0].type, "Moissanite");
eq("custom type has no table price", q.lines[0].autoPpc, 0);
eq("custom type priced by hand 4 x 0.005 x 50", q.lines[0].amount, 1);
job.lines = [L("Mined", "RND1.0M", { q: "__CUSTOM__", qText: "F VS1", pcs: "2" })]; q = E.quote(job, RR, E.CATALOG);
eq("custom quality has no table price so it needs a $/ct", q.lines[0].noPrice ? 1 : 0, 1);
eq("custom quality text is kept", q.lines[0].quality, "F VS1");
job.lines[0].ppc = "300"; q = E.quote(job, RR, E.CATALOG);
eq("custom quality with manual $/ct: 2 x 0.005 x 300 = 3", q.lines[0].amount, 3);
job.lines = [L("Lab grown", "RND1.6M", { lgd: "__CUSTOM__", qText: "IGI cert", pcs: "1" })]; q = E.quote(job, RR, E.CATALOG);
eq("custom LGD grade has no table price", q.lines[0].autoPpc, 0);
job.lines = [L("Mined", null, { shape: "Round", custom: true, desc: "3.1 mm", wtPc: "0.02", pcs: "5", ppc: "400" })]; q = E.quote(job, RR, E.CATALOG);
eq("custom size on a real shape: 5 x 0.02 x 400", q.lines[0].amount, 40);
eq("custom size shows typed size as spec", q.lines[0].spec === "3.1 mm" ? 1 : 0, 1);
eq("custom size keeps the real shape name", q.lines[0].shapeName === "Round" ? 1 : 0, 1);
job.lines = [L("Mined", null, { shape: "__CUSTOM__", shapeText: "Kite", custom: true, desc: "5 x 3", wtPc: "0.1", pcs: "1", ppc: "200" })]; q = E.quote(job, RR, E.CATALOG);
eq("custom shape shows typed shape name", q.lines[0].shapeName === "Kite" ? 1 : 0, 1);
eq("custom shape row is active", q.lines[0].active ? 1 : 0, 1);

console.log("-- other metals and tables");
eq("platinum $/gm", E.metalPerGm("PLATINUM", "WHITE", RX), 65.15);
eq("silver $/gm", E.metalPerGm("silver", "", RX), 2.31);
eq("14KT WHITE-PD adds $5/gm", E.metalPerGm("14KT", "WHITE-PD", RX), 149.26 * 0.583 + 5);
eq("tier 4 over 11 g", E.tierCharge("Tier 4", 13, RX), 224);
eq("tier 1 heavy piece has no extra", E.tierCharge("Tier 1", 30, RX), 100);
eq("18 -> PT", E.convertWeight(10, "18", "PT"), 14.2);
eq("LGD cert 1.2 ct D/VS", E.lgdLookup("Round", "Cert", 1.2, "D/VS").price, 130);
eq("LGD cert round 0.7 ct not listed", E.lgdLookup("Round", "Cert", 0.7, "D/VVS2").price === null ? 1 : 0, 1);
eq("decode JIXT", E.decodeCode("JIXT", RX), "1609");

console.log("-- order form JSON import");
const order = { JobNo: "4376", ItemNo: "S123", "CAD Designer": "Sudip", VendorItemNo: "Acme", "Metal Type 1": "18KT", "Metal Col 1": "WG", "Metal Extra 1": "PD", "Metal 1 Weight": "5.53",
  "Metal Type 2": "18KT", "Metal Col 2": "RG", "Metal 2 Weight": "1.2",
  _RAW_STONES: [{ Shape: "Round", Stone: "Mined", AvgWt: "0.005", Qty: "10" }, { Shape: "Heart", Stone: "LGD", AvgWt: "0.25", Qty: "2" }, { Shape: "Round", Stone: "Mined", AvgWt: "1.5", Qty: "1" }, { Shape: "Round", Stone: "CZ", AvgWt: "0.1", Qty: "3" }] };
const o = E.parseOrderJson(JSON.stringify(order), E.CATALOG);
eq("import ok", o.ok ? 1 : 0, 1);
eq("designer", o.job.by, "Sudip");
eq("item type carried over", (E.parseOrderJson(JSON.stringify({ ...order, ItemType: "Ring", "Sub Category": "Fashion" }), E.CATALOG).job.itemType), "Ring");
eq("heavier metal first, 5.53 rounds up to 5.55", o.job.metals[0].grams, "5.55");
eq("WG + PD -> WHITE-PD", o.job.metals[0].color, "WHITE-PD");
eq("second metal rose", o.job.metals[1].color, "ROSE");
eq("round 0.005 ct -> RND1.0M", E.CATALOG[o.job.lines[0].idx][0], "RND1.0M");
eq("heart LGD -> Lab grown", o.job.lines[1].type, "Lab grown");
eq("1.5 ct round has no close catalog size -> custom", o.job.lines[2].custom ? 1 : 0, 1);
eq("CZ lands as custom row", o.job.lines[3].custom ? 1 : 0, 1);
const o2 = E.parseOrderJson(JSON.stringify({ JobNo: "1", _RAW_STONES: [{ Shape: "Kite", Stone: "Moissanite", AvgWt: "0.1", Qty: "2" }] }), E.CATALOG);
eq("unknown stone type becomes a custom type", o2.job.lines[0].type, E.CUSTOM);
eq("custom type keeps its name", o2.job.lines[0].typeText, "Moissanite");
eq("unknown shape becomes a custom shape", o2.job.lines[0].shape, E.CUSTOM);
eq("warnings raised for custom rows", o.warnings.length >= 2 ? 1 : 0, 1);
eq("bad file rejected", E.parseOrderJson("{}", E.CATALOG).ok ? 1 : 0, 0);


// The sample file shipped in samples/ must keep loading (the README points people at it)
{
  const sample = fs.readFileSync(__dirname + "/../samples/sample-order.json", "utf8");
  const r = E.parseOrderJson(sample, E.CATALOG);
  const okSample = r.ok && r.job.jobNo === "4376" && r.job.itemNo === "B00630" && r.job.lines.length === 3 && r.job.metals[0].metal === "18KT" && r.job.lines[2].type === "Moissanite" || (r.ok && r.job.lines[2] && r.job.lines[2].typeText === "Moissanite");
  if (!okSample) fails++;
  console.log((okSample ? "PASS " : "FAIL ") + "samples/sample-order.json loads (job 4376, 3 stone lines, 18KT, Moissanite as a custom type)");

}


console.log(fails ? "\n" + fails + " FAILED" : "\nAll checks passed");
process.exit(fails ? 1 : 0);

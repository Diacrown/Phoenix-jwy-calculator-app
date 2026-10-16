/* ---------- Phoenix pricing engine (pure functions) ---------- */
function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function norm(s) { return String(s == null ? "" : s).trim().toUpperCase(); }
function blank(v) { return v === "" || v === null || v === undefined; }
const roundUp5 = n => (Number.isFinite(n) ? Math.ceil(n / 5 - 1e-9) * 5 : 0);
const roundUpWt = n => (Number.isFinite(n) ? Math.round(Math.ceil(n / 0.05 - 1e-9) * 0.05 * 100) / 100 : n);

/* $/gm for one metal line. Gold = spot 999 x karat factor + colour surcharge.
   Platinum and Silver use their spot $/gm directly, as in the sheet. */
function metalPerGm(metal, color, R) {
  const m = norm(metal);
  if (m === "PLATINUM") return num(R.spot.platinum.gm);
  if (m === "SILVER") return num(R.spot.silver.gm);
  const f = R.metals.find(x => norm(x.name) === m);
  if (!f) return 0;
  const col = R.colors.find(x => norm(x.name) === norm(color));
  return num(R.spot.gold.gm) * num(f.k) + (col ? num(col.s) : 0);
}

/* Tier charge = base + (grams over the weight limit) x extra per gram */
function tierCharge(name, grams, R) {
  const t = R.tiers.find(x => x.name === name);
  if (!t) return 0;
  return num(t.base) + Math.max(0, grams - num(t.limit)) * num(t.extra);
}

function sspPrice(group, quality, R) {
  if (!group) return 0;
  const row = R.ssp[group];
  const i = R.sspCols.indexOf(quality);
  if (!row || i < 0) return 0;
  return num(row[i]);
}

function lgdLookup(shape, cert, ct, col) {
  const w = num(ct);
  const ci = LGD_COLS.indexOf(col);
  let row = null;
  if (cert === "Cert") {
    row = LGD_CERT.find(r => w >= r.lo && w <= r.hi && (!r.fancyOnly || shape === "Fancy")) || null;
  } else {
    row = LGD_NONCERT.find(r => r.shape === shape && w >= r.lo && w <= r.hi) || null;
  }
  if (!row) return { price: null, why: "This size is not in the price table." };
  const p = ci >= 0 ? row.p[ci] : row.p[0];
  if (p == null) return { price: null, why: "No price listed for " + col + " in " + row.band + "." };
  return { price: p, band: row.band };
}

const CUSTOM = "__CUSTOM__";

/* One stone-schedule line.
   line = { type, typeText, shape, shapeText, idx, custom, desc, q, lgd, qText, proposed, pcs, wtPc, ppc }
   idx points into CATALOG. Any of type, shape, size and quality can be a custom entry:
   type === CUSTOM uses typeText, shape === CUSTOM uses shapeText, custom (size) uses desc and wtPc,
   q / lgd === CUSTOM uses qText. Custom entries have no price table, so they need a manual $/ct. */
function lineCalc(line, R, CAT) {
  const typeCustom = line.type === CUSTOM;
  const type = typeCustom ? (String(line.typeText || "").trim() || "Custom") : (line.type || "Mined");
  const isMined = !typeCustom && type === "Mined", isLgd = !typeCustom && type === "Lab grown";
  const rnd = R.roundMode !== "off";
  const c = !line.custom && line.shape !== CUSTOM && line.idx != null && CAT[line.idx] ? CAT[line.idx] : null;
  const pcs = num(line.pcs);
  const autoWt = c && c[3] != null ? c[3] : 0;
  const wtPc = c ? (blank(line.wtPc) ? autoWt : num(line.wtPc)) : num(line.wtPc);
  const total = pcs * wtPc;
  const group = c ? c[4] : "";
  const shapeName = c ? c[1] : (line.shape === CUSTOM ? String(line.shapeText || "").trim() : (line.shape || ""));
  const shapeClass = shapeName === "Round" ? "Round" : "Fancy";
  const qCustom = isMined ? line.q === CUSTOM : (isLgd ? line.lgd === CUSTOM : false);

  let auto = 0, lgdNote = "", quality = "";
  if (isMined) {
    quality = qCustom ? String(line.qText || "").trim() : (line.q || "");
    if (!qCustom && c && group) auto = sspPrice(group, line.q, R);
  } else if (isLgd) {
    const g = line.lgd || "SSP";
    const opt = LGD_GRADE_OPTS.find(o => o[0] === g);
    quality = qCustom ? String(line.qText || "").trim() : (opt ? opt[1] : g);
    if (qCustom) auto = 0;
    else if (g === "SSP") auto = c && group ? sspPrice(group, "LGD", R) : 0;
    else {
      const r = g === "NONCERT" ? lgdLookup(shapeClass, "Non-cert", wtPc, "D/VVS2") : lgdLookup(shapeClass, "Cert", wtPc, g);
      auto = r.price || 0; if (r.price == null) lgdNote = r.why;
    }
  }
  const over = !blank(line.ppc);
  const ppc = over ? num(line.ppc) : auto;
  const raw = pcs > 0 ? ppc * total : 0;
  const amount = rnd ? Math.round(raw) : raw;
  const hasSize = !!c || (!!line.custom && (!!String(line.desc || "").trim() || !!shapeName || wtPc > 0));
  const active = pcs > 0 && hasSize;
  return {
    cat: c, type, typeCustom, qCustom, quality, pcs, wtPc, autoWt, total, autoPpc: auto, ppc, overridden: over, amount,
    shapeName, spec: c ? (c[2] || "no size listed") : (line.custom ? String(line.desc || "") : ""),
    catWtMissing: !!c && autoWt === 0,
    noWeight: active && wtPc === 0,
    noPrice: active && ppc === 0,
    lgdNote, active
  };
}

function encodeCode(value, R) {
  const s = String(Math.round(num(value)));
  return [...s].map(ch => {
    const i = R.cipher.from.indexOf(ch);
    return i >= 0 && i < R.cipher.to.length ? R.cipher.to[i] : ch;
  }).join("");
}
function decodeCode(code, R) {
  return [...String(code).trim()].map(ch => {
    const i = R.cipher.to.indexOf(ch.toUpperCase());
    return i >= 0 && i < R.cipher.from.length ? R.cipher.from[i] : "?";
  }).join("");
}


/* Live metal rates: parse the MetalRates tab of the rates Google Sheet (CSV).
   Columns used: Metal Type (AU/PT/AG), PM Rate As On, PM Rate/Oz, NetRate/Gm, Wastage.
   Same maths as the sheet and the JWY calculator: $/gm = PM rate per oz / 31.1035 x wastage. */
function csvRows(text) {
  const rows = []; let row = [], f = "", q = false;
  const t = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const cellNum = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
function parseMetalRatesCsv(text) {
  const rows = csvRows(text).filter(r => r.some(c => String(c).trim() !== ""));
  if (rows.length < 2) return null;
  const key = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
  const head = rows[0].map(key), col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const iMetal = col("metaltype", "metal"), iOz = col("pmrateoz"), iAsOn = col("pmrateason", "rateason", "asof"), iNet = col("netrategm"), iWaste = col("wastage");
  if (iMetal < 0 || iOz < 0) return null;
  const map = { AU: "gold", PT: "platinum", AG: "silver" }, out = {};
  rows.slice(1).forEach(r => {
    const k = map[String(r[iMetal] || "").trim().toUpperCase()]; if (!k) return;
    const oz = cellNum(r[iOz]), markup = iWaste >= 0 ? cellNum(r[iWaste]) : 0;
    if (!(oz > 0) || !(markup > 0)) return;
    const net = iNet >= 0 ? cellNum(r[iNet]) : 0;
    out[k] = { oz, markup, gm: net > 0 ? net : Math.round(oz / 31.1035 * markup * 100) / 100, asOf: iAsOn >= 0 ? String(r[iAsOn] || "").trim() : "" };
  });
  return out.gold && out.platinum && out.silver ? out : null;
}

/* Phoenix tier pricing: gross = metal + tier charge + diamonds (+ additional charge).
   Casting, labor, setting and CAD are already inside the tier charge, so they are not added again.
   The local total is gross / X-to-USD rate, rounded up to the next 5 (JWY style). */
function quote(job, R, CAT) {
  const rnd = R.roundMode !== "off";
  const r0 = x => (rnd ? Math.round(x) : x);
  const lines = job.lines.map(l => lineCalc(l, R, CAT));
  const carats = lines.reduce((a, l) => a + l.total, 0);
  const pieces = lines.reduce((a, l) => a + l.pcs, 0);
  const diamonds = lines.reduce((a, l) => a + l.amount, 0);

  const parts = job.metals.map(m => {
    const g = num(m.grams);
    const perGm = g > 0 ? metalPerGm(m.metal, m.color, R) : 0;
    return { metal: m.metal, color: m.color, grams: g, perGm, cost: g * perGm };
  });
  const grams = parts.reduce((a, p) => a + p.grams, 0);
  const metal = r0(parts.reduce((a, p) => a + p.cost, 0));
  const tier = r0(tierCharge(job.tier, grams, R));
  const extra = num(job.extraAmt);
  const gross = metal + tier + diamonds + extra;

  const loc = R.locations.find(x => x.code === job.loc) || R.locations[0];
  const cur = loc ? loc.cur : "USD";
  const fxRow = R.fx.find(x => x.cur === cur);
  const rate = cur === "USD" ? 1 : (fxRow ? num(fxRow[R.fxUse]) : 0);
  const localRaw = rate > 0 ? gross / rate : null;
  const local = localRaw == null ? null : (rnd ? roundUp5(localRaw) : localRaw);
  const ov = parseFloat(job.override);
  const hasOverride = job.override !== "" && job.override != null && Number.isFinite(ov) && ov > 0;
  const finalLocal = hasOverride ? ov : local;

  // USD total: the gross is already USD, rounded up to the next 5 like the local total.
  // An override typed in the local currency carries over to USD through the fx rate.
  const usd = rnd ? roundUp5(gross) : gross;
  const ovU = parseFloat(job.overrideUsd);
  const hasOverrideUsd = job.overrideUsd !== "" && job.overrideUsd != null && Number.isFinite(ovU) && ovU > 0;
  const finalUsd = hasOverrideUsd ? ovU
    : (hasOverride && rate > 0 ? (rnd ? roundUp5(ov * rate) : ov * rate) : usd);

  return {
    lines, carats, pieces, diamonds, parts, grams, metal, tier, extra, gross, cur, rate, local, hasOverride, finalLocal, usd, hasOverrideUsd, finalUsd,
    code: encodeCode(gross, R), locCode: loc ? loc.code : ""
  };
}

function convertWeight(w, from, to) {
  const i = CONV_KEYS.indexOf(from), j = CONV_KEYS.indexOf(to);
  if (i < 0 || j < 0) return 0;
  return num(w) * CONV[i][j];
}

/* Order-form JSON (CAD Order Form export) -> Phoenix job.
   Ported from the JWY calculator's parser so the same files load. */
function cardMetalToPhoenix(type, color, extra) {
  const t = norm(type), c = norm(color), ex = norm(extra);
  if (t === "PT950" || t === "PT900" || t === "PT600" || t === "PLATINUM") return { metal: "Platinum", color: "WHITE" };
  if (t === "AG925" || t === "AG935" || t === "SILVER") return { metal: "Silver", color: "WHITE" };
  const m = t.match(/(\d+)\s*KT/);
  if (!m) return { warn: '"' + (type || "") + '" is not a Phoenix metal' };
  const kt = m[1] + "KT";
  if (!["9KT", "10KT", "14KT", "18KT", "22KT"].includes(kt)) return { warn: kt + " is not a Phoenix metal" };
  let col = "YELLOW";
  if (c === "WG" || c === "WHITE") col = ex === "PD" ? "WHITE-PD" : "WHITE";
  else if (c === "RG" || c === "ROSE") col = "ROSE";
  else if (c === "YG" || c === "YELLOW" || c === "") col = "YELLOW";
  if (kt === "22KT") col = "YELLOW";
  return { metal: kt, color: col };
}

function nearestCatalog(shapeName, avgWt, CAT) {
  const s = String(shapeName || "").toLowerCase().trim();
  let best = -1, bestDiff = Infinity;
  CAT.forEach((d, i) => {
    if (d[1].toLowerCase() !== s || d[3] == null) return;
    const diff = Math.abs(d[3] - avgWt);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });
  if (best < 0) return -1;
  const rel = bestDiff / Math.max(avgWt, CAT[best][3], 0.001);
  return rel > 0.35 ? -1 : best;
}

function parseOrderJson(text, CAT) {
  let d;
  try { d = typeof text === "string" ? JSON.parse(text) : text; } catch (e) { return { ok: false, why: "That file is not valid JSON." }; }
  if (!d || typeof d !== "object" || (!("JobNo" in d) && !("_RAW_STONES" in d))) return { ok: false, why: "This does not look like CAD order form data (no JobNo or _RAW_STONES field)." };
  const warnings = [];
  const job = {
    by: d["CAD Designer"] || "", jobNo: d["JobNo"] || "", itemNo: d["ItemNo"] || "", itemSize: d["Item Size"] || "",
    customer: d["VendorItemNo"] || "", remarks: d["Client Notes"] || "", itemType: d["ItemType"] || "", subCategory: d["Sub Category"] || ""
  };
  const cands = [
    { m: cardMetalToPhoenix(d["Metal Type 1"], d["Metal Col 1"], d["Metal Extra 1"]), wt: num(d["Metal 1 Weight"]) },
    { m: cardMetalToPhoenix(d["Metal Type 2"], d["Metal Col 2"], d["Metal Extra 2"]), wt: num(d["Metal 2 Weight"]) }
  ].filter(x => x.wt > 0).sort((a, b) => b.wt - a.wt);
  const metals = [];
  cands.forEach(x => { if (x.m.warn) warnings.push(x.m.warn + ", pick the metal by hand."); metals.push({ metal: x.m.metal || "18KT", color: x.m.color || "YELLOW", grams: String(roundUpWt(x.wt)) }); });
  job.metals = metals;
  const raw = Array.isArray(d["_RAW_STONES"]) ? d["_RAW_STONES"] : [];
  job.lines = raw.filter(s => s.Shape && num(s.Qty) > 0).map((s, i) => {
    const shape = String(s.Shape || ""), stoneRaw = String(s.Stone || "").trim(), su = stoneRaw.toUpperCase();
    const avg = num(s.AvgWt);
    const isRound = shape.toLowerCase().includes("round") || shape.toLowerCase() === "rnd";
    const explicitCustom = String(s.Mode || "").toLowerCase() === "custom" || String(s.SizeIdx || "").toLowerCase() === "custom";
    const pureMined = su === "MINED", pureLgd = su === "LGD" || su === "LAB GROWN";
    const known = SHAPE_ORDER.find(n => n.toLowerCase() === (isRound ? "round" : shape.toLowerCase()) && CATALOG.some(c => c[1] === n));
    const typeKnown = pureLgd ? "Lab grown" : (pureMined || !stoneRaw ? "Mined" : (STONE_TYPES.includes(stoneRaw) ? stoneRaw : CUSTOM));
    const line = { type: typeKnown, typeText: typeKnown === CUSTOM ? stoneRaw : "", shape: "", shapeText: "", idx: null, custom: false, desc: "", q: "TW SI1", lgd: isRound ? "SSP" : "NONCERT", qText: "", proposed: "", pcs: String(num(s.Qty)), wtPc: "", ppc: "" };
    let k = -1;
    if (!explicitCustom && (pureMined || pureLgd)) k = nearestCatalog(isRound ? "Round" : shape, avg, CAT);
    const dims = [s.L, s.W, s.H].filter(Boolean).join(" x ");
    if (k >= 0) { line.idx = k; line.shape = CAT[k][1]; if (line.type === "Lab grown" && !CAT[k][4]) line.lgd = "NONCERT"; }
    else {
      line.custom = true; line.wtPc = avg ? String(avg) : "";
      if (known) { line.shape = known; line.desc = dims; }
      else { line.shape = CUSTOM; line.shapeText = shape; line.desc = dims; }
      if (pureLgd) line.lgd = "NONCERT";
      warnings.push("Line " + (i + 1) + ": " + (explicitCustom ? "custom row from the form" : (!stoneRaw ? "no stone type" : (pureMined || pureLgd ? "no close size in the catalog" : '"' + stoneRaw + '" has no price data'))) + ". Enter the $/ct by hand.");
    }
    return line;
  });
  const images = {
    cad: (Array.isArray(d["_VERSIONS"]) ? d["_VERSIONS"] : []).filter(v => v && v.dataUrl).map(v => v.dataUrl),
    ref: (Array.isArray(d["_CLIENT_REF_IMAGES"]) ? d["_CLIENT_REF_IMAGES"] : []).filter(v => v && v.dataUrl).map(v => v.dataUrl)
  };
  return { ok: true, job, warnings, images };
}

if (typeof module !== "undefined") {
  module.exports = { parseMetalRatesCsv, CATALOG, DEFAULT_RATES, quote, lineCalc, metalPerGm, tierCharge, sspPrice, encodeCode, decodeCode, convertWeight, lgdLookup, num, roundUp5, parseOrderJson };
}

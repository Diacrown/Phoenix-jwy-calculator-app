/* ---------- Exports: quote PDF and GATI workbook ----------
   Needs jsPDF + AutoTable (PDF) and SheetJS (GATI) to be loaded as globals. */

/* ===== GATI bulk-export bridge, ported from the JWY calculator (gatiExport.js) =====
   Full 214-column "Default Format", exact order. GATI wants every column present, even when blank. */
const GATI_COLUMNS = [
  "SrNo","InwardDate","JewelCode","JewelAliasNo","StyleCode","Manufacturer","Category","SubCategory",
  "StockType","MakeType","InwardQty","ItemPcs","Collection","isBaseCollection","ItemSize","ItemCode",
  "Size","SetCode","RawFormula","Pcs","Weight","Rate","Amount","DisMarkupOn","DisMarkupPer","DisMarkupAmt",
  "CostRate","CostAmount","DisMarkupCostOn","DisMarkupCostPer","DisMarkupCostAmt","MItemCode","NetWt",
  "MRate","MAmt","MDisMarkupOn","MDisMarkupPer","MDisMarkupAmt","MCostRate","MCostAmt","MDisMarkupCostOn",
  "MDisMarkupCostPer","MDisMarkupCostAmt","CPFRate","CPFIsFix","CPFAmt","CPFDisMarkupPer",
  "CPFAmtDisMarkupPer","CPFCostRate","CPFCostIsFix","CPFCostAmt","CPFDisMarkupCostPer",
  "CPFAmtDisMarkupCostPer","MakingOn","MakingCostOn","Remarks","MiscRemarks","Currency","CurrencyValue",
  "RateChartCode","StyleAliasNo","SalePlusPer","SalePlusIsFix","SalePlusAmt","CostPlusPer","CostPlusIsFix",
  "CostPlusAmt","OrderDate","OrderNo","PurchaseOrderNoOrBagNo","PurchaseOrderNoSrNoOrBagNo",
  "OrderCustomerCode","OrderCustomerName","OrderSalesPersonCode","OrderSalesPersonName","Brand","Gender",
  "ItemPoNo","PoNo","PoDate","ExpDelDate","CostDiscountPer","CostDiscountIsFix","CostDiscountAmt",
  "SaleDiscountPer","SaleDiscountIsFix","SaleDiscountAmt","Restricted","IsComplete","TagPrice",
  "ProductCode","ReOrderQty","MasterQty","StampingInstruction","CustomerProductionInstruction",
  "DesignProductionInstruction","SpecialRemarks","StyleHistory","FixPrice","WaxWt","ModelWt",
  "Jewelry_LabName","Jewelry_CertificateNo","BaseMetalCalculationCode","BaseMetalCalculationCostCode",
  "MouldNo","MouldDescription","MouldQty","MouldWtDesc","ExplorationCode","ExplorationValue","Location",
  "Branch","PartyStyle_CustomerName","ReferenceStyleCode","MfgCode","AccessoriesCode","BatchNo",
  "CertiBatchNo","NBatchNo","NRate","Description","SetCostRate","SetCostAmount","SetDisMarkupCostOn",
  "SetDisMarkupCostPer","SetRate","SetAmount","SetDisMarkupOn","SetDisMarkupPer","HandCostRate",
  "HandCostAmount","HandDisMarkupCostOn","HandDisMarkupCostPer","HandRate","HandAmount","HandDisMarkupOn",
  "HandDisMarkupPer","StonePosition","LossPer","MetalLossPerCalcOn","LossPerIsFix","LossWeight",
  "LossCostPer","MetalLossPerCalcCostOn","LossCostPerIsFix","LossCostWeight","MakeDate","HsnName",
  "NotBase_CPFRate","NotBase_CPFIsFix","NotBase_CPFAmt","NotBase_CPFDisMarkupPer",
  "NotBase_CPFAmtDisMarkupPer","NotBase_CPFCostRate","NotBase_CPFCostIsFix","NotBase_CPFCostAmt",
  "NotBase_CPFDisMarkupCostPer","NotBase_CPFAmtDisMarkupCostPer","NotBase_LossPer",
  "NotBase_MetalLossPerCalcOn","NotBase_LossPerIsFix","NotBase_LossWeight","NotBase_LossCostPer",
  "NotBase_MetalLossPerCalcCostOn","NotBase_LossCostPerIsFix","NotBase_LossCostWeight","Parts","MPcs",
  "MAccessoriesCode","MBatchNo","MCertiBatchNo","MNBatchNo","MNRate","MSize","MSetCode","MDescription",
  "MSetCostRate","MSetCostAmount","MSetDisMarkupCostOn","MSetDisMarkupCostPer","MSetRate","MSetAmount",
  "MSetDisMarkupOn","MSetDisMarkupPer","MHandCostRate","MHandCostAmount","MHandDisMarkupCostOn",
  "MHandDisMarkupCostPer","MHandRate","MHandAmount","MHandDisMarkupOn","MHandDisMarkupPer",
  "WebDescription","ParentStyleCode","DesignBy","MinWeight","MaxWeight","StoneWt","DefaultWt",
  "ProductionWeight","MMinWeight","MMaxWeight","MStoneWt","MDefaultWt","MProductionWeight",
  "UnitPriceRounding","UnitCostPriceRounding","RhodiumInstruction","DiamondInstruction","SizeInstruction",
  "EndClientPrice","ProductionRouteCode","JewelryColor",
];

function gatiBlankRow() { const row = {}; for (const col of GATI_COLUMNS) row[col] = ""; return row; }

const GATI_METAL_QUALITY = { "9KT": "09", "14KT": "14", "18KT": "18", "PLATINUM": "950" };
const GATI_METAL_COLOR = { YELLOW: "YG", ROSE: "RG", WHITE: "WG", "WHITE-PD": "WG" };
function gatiMetalCode(metal, color) {
  if (!metal) return "";
  const m = norm(metal);
  const quality = GATI_METAL_QUALITY[m];
  const col = m === "PLATINUM" ? "PT" : GATI_METAL_COLOR[norm(color)];
  if (!quality || !col) {
    const missing = [!quality && "quality code", !col && "color code"].filter(Boolean).join(" + ");
    return "NEEDS-GATI-DATA:" + metal + " " + (color || "") + "(missing " + missing + ")";
  }
  return "G" + quality + col;
}
const GATI_STONE_SHAPE = { "Round": "B", "Baguette": "BAG", "Emerald": "E", "Heart": "H", "Marquise": "M", "Oval": "O", "Princess": "P", "Pear": "D", "Radiant": "R", "Triangle": "TRG", "Trilliant": "TRN", "Tappered Bagguette": "TAP" };
const GATI_STONE_QUALITY = { "TW VVS": "10", "TW VS1": "11", "TW VS2": "12", "TW SI1": "13", "TW SI2": "14", "TW SI3": "15", "TW I1": "16", "WH SI": "23" };
function gatiStoneCode(lc, line) {
  const shapeCode = GATI_STONE_SHAPE[lc.shapeName];
  if (!shapeCode) return "RECHECK:" + (lc.shapeName || "custom") + " shape not yet in GATI's Stone_shape master";
  if (lc.type === "Lab grown") return "RECHECK:" + lc.shapeName + " Lab Grown -- LD-prefix quality codes not yet confirmed";
  if (lc.type !== "Mined") return "RECHECK:" + lc.type + " stone type has no GATI item code yet";
  const qc = GATI_STONE_QUALITY[line.q];
  if (!qc) return "RECHECK:" + (lc.quality || "quality") + " quality code not yet confirmed";
  return "ND" + shapeCode + qc;
}
const GATI_CATEGORY = { "Ring": "R", "Earring": "E", "Earrings": "E", "Pendant": "P", "Pendants": "P", "Necklace": "N", "Bracelet": "B", "Bracelets": "B", "Arm Band": "A", "Charm": "C", "Charms": "C" };
function gatiCategory(t) { return GATI_CATEGORY[t] || (t ? "RECHECK:" + t + " not in Category master" : ""); }
const GATI_COLLECTION = { "Fashion": "Fashion", "Solitaire": "Solitaire" };
function gatiCollection(v) {
  if (!v) return "";
  return GATI_COLLECTION[v] || 'RECHECK:"' + v + '" -- no match in Collection.xlsx (only Fashion/Solitaire confirmed so far)';
}
const GATI_FIXED = { StockType: "Finished", MakeType: "Casting", InwardQty: 1, ItemPcs: 1, SetCode: "Setting", MakingOn: "NetWt", MakingCostOn: "NetWt", RateChartCode: "Diamond SSP", BaseMetalCalculationCode: "On Net Wt", BaseMetalCalculationCostCode: "On Net Wt" };
function gatiDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

/* One Phoenix quote -> GATI rows. Returns { rows, flagged } (flagged = fields needing a manual look). */
function buildGatiRows(job, Q) {
  const list = Q.lines.map((lc, i) => ({ lc, line: job.lines[i] })).filter(x => x.lc.active && x.lc.total > 0);
  const rows = list.map(({ lc, line }, idx) => {
    const row = gatiBlankRow();
    Object.assign(row, { SrNo: idx === 0 ? 1 : "", StyleCode: job.itemNo || "", Pcs: lc.pcs || "", Weight: lc.total, ItemCode: gatiStoneCode(lc, line), Size: lc.spec === "no size listed" ? "" : lc.spec, Currency: "$", CurrencyValue: 1 }, GATI_FIXED);
    if (idx === 0) {
      const p = Q.parts[0] && Q.parts[0].grams > 0 ? job.metals[0] : (Q.parts[1] && Q.parts[1].grams > 0 ? job.metals[1] : null);
      Object.assign(row, {
        InwardDate: gatiDate(job.date), Manufacturer: "EL", Category: gatiCategory(job.itemType), Collection: gatiCollection(job.subCategory),
        MItemCode: p ? gatiMetalCode(p.metal, p.color) : "", NetWt: p ? num(p.grams) : ""
      });
    }
    return row;
  });
  let flagged = 0;
  rows.forEach(r => Object.values(r).forEach(v => { if (typeof v === "string" && (v.startsWith("NEEDS-GATI-DATA:") || v.startsWith("RECHECK:"))) flagged++; }));
  return { rows, flagged };
}
function gatiWorkbookBytes(rows) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: GATI_COLUMNS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "GATI Import");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

/* ===== Quote PDF (jsPDF + AutoTable) ===== */
const PDF_PLUM = [36, 27, 30], PDF_ROSE = [156, 74, 99], PDF_TINT = [251, 238, 242], PDF_MUTED = [139, 118, 128];
function pdfMoney(n) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pdfLocal(n, cur) { return (cur === "AUD" ? "AUD $" : cur === "NZD" ? "NZD $" : "$") + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pdfSafe(t) { return String(t == null ? "" : t).replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "?"); }

/* ctx = { job, Q, images: [dataUrl], alloyLabel(metalObj), variant } */
function buildQuotePdf(ctx) {
  const { jsPDF } = window.jspdf;
  const { job, Q, variant } = ctx, full = variant === "full", anyPrice = variant !== "noPrice";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14;
  const title = anyPrice ? (full ? "Quotation" : "Quotation Order") : "Production Sheet";
  doc.setFillColor(...PDF_PLUM); doc.rect(0, 0, W, 26, "F");
  doc.setFillColor(...PDF_ROSE); doc.rect(0, 26, W, 1.2, "F");
  // Made with Love logo on the left of the band, then a thin divider and the document title
  let tx = M;
  try {
    const lp = doc.getImageProperties(LOGOS.white), lh = 15, lw = lh * lp.width / lp.height;
    doc.addImage(LOGOS.white, "PNG", M, (26 - lh) / 2, lw, lh);
    tx = M + lw + 6;
    doc.setDrawColor(...PDF_ROSE); doc.setLineWidth(0.3); doc.line(tx - 3, 6, tx - 3, 20);
  } catch (e) { /* no logo: the title simply starts at the margin */ }
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("PHOENIX JEWELLERY", tx, 10);
  doc.setFontSize(18); doc.text(title, tx, 19);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(pdfSafe("Job " + (job.jobNo || "-") + "   Item " + (job.itemNo || "-")), W - M, 10, { align: "right" });
  doc.text(pdfSafe("Quote " + (job.stage || "Q1") + "   " + (job.date || "")), W - M, 16, { align: "right" });
  let y = 36;

  const metals = Q.parts.map((p, i) => ({ p, m: job.metals[i] })).filter(x => x.p.grams > 0).map(x => ctx.alloyLabel(x.m) + " " + x.p.grams.toFixed(3) + " g").join("  +  ");
  const kv = [["Customer", job.customer], ["Designer", job.by], ["Item size", job.itemSize], ["Location", Q.locCode], ["Metal", metals]];
  doc.setFontSize(8);
  kv.forEach((r, i) => {
    const col = i % 3, row = Math.floor(i / 3), x = M + col * 62, yy = y + row * 11;
    doc.setTextColor(...PDF_MUTED); doc.setFont("helvetica", "bold"); doc.text(r[0].toUpperCase(), x, yy);
    doc.setTextColor(...PDF_PLUM); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(pdfSafe(r[1] || "-"), x, yy + 4.5, { maxWidth: 58 }); doc.setFontSize(8);
  });
  y += 24;

  const imgs = (ctx.images || []).slice(0, 4);
  if (imgs.length) {
    let x = M; const h = 38;
    imgs.forEach(u => {
      try {
        const pr = doc.getImageProperties(u), w = Math.min(60, h * pr.width / pr.height);
        if (x + w > W - M) return;
        doc.addImage(u, pr.fileType || "JPEG", x, y, w, h); x += w + 4;
      } catch (e) { /* skip unreadable image */ }
    });
    y += h + 6;
  }

  const rows = Q.lines.map((lc, i) => ({ lc, line: job.lines[i] })).filter(x => x.lc.active && x.lc.total > 0);
  const shapeSize = lc => lc.cat ? lc.cat[1] + " - " + lc.spec : ([lc.shapeName, lc.spec].filter(Boolean).join(" ") || "Custom stone");
  const head = ["Sr", "Type", "Shape / size", "Quality", "Qty", "Total ct"].concat(full ? ["$/ct", "$ total"] : []);
  const body = rows.map((x, k) => [String(k + 1), x.lc.type, shapeSize(x.lc), full ? (x.lc.quality || "-") : (x.line.proposed || "-"), String(x.lc.pcs), x.lc.total.toFixed(3)]
    .concat(full ? [pdfMoney(x.lc.ppc), pdfMoney(x.lc.amount)] : []).map(pdfSafe));
  const foot = [["", "", "Totals", "", String(Q.pieces), Q.carats.toFixed(3)].concat(full ? ["", pdfMoney(Q.diamonds)] : [])];
  doc.autoTable({
    startY: y, head: [head], body, foot, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: PDF_PLUM, lineColor: [243, 220, 227], lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: PDF_PLUM, textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: PDF_TINT, textColor: PDF_PLUM, fontStyle: "bold" },
    columnStyles: full ? { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } } : { 4: { halign: "right" }, 5: { halign: "right" } }
  });
  y = doc.lastAutoTable.finalY + 8;

  const need = (h) => { if (y + h > 280) { doc.addPage(); y = 20; } };
  if (full) {
    const comp = [["Metal", Q.metal], ["Casting - " + job.tier, Q.tier], ["Diamonds", Q.diamonds]];
    if (Q.extra > 0) comp.push([job.extraName || "Additional charge", Q.extra]);
    need(comp.length * 6 + 34);
    doc.setFontSize(9.5);
    comp.forEach(([a, b]) => { doc.setTextColor(...PDF_PLUM); doc.setFont("helvetica", "normal"); doc.text(pdfSafe(a), 120, y); doc.text(pdfMoney(b), W - M, y, { align: "right" }); y += 6; });
    doc.setDrawColor(...PDF_ROSE); doc.line(120, y - 3, W - M, y - 3);
    doc.setFont("helvetica", "bold"); doc.text("Gross total (USD)", 120, y + 2); doc.text(pdfMoney(Q.gross), W - M, y + 2, { align: "right" }); y += 10;
  }
  if (anyPrice) {
    need(20);
    doc.setFillColor(...PDF_ROSE); doc.roundedRect(110, y, W - M - 110, 14, 2, 2, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(pdfSafe("Total - " + Q.cur), 114, y + 5.5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(pdfSafe(Q.finalLocal == null ? "no rate" : pdfLocal(Q.finalLocal, Q.cur)), W - M - 4, y + 10, { align: "right" });
    y += 22;
  }
  doc.setTextColor(...PDF_PLUM); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (job.remarks) { need(16); doc.setFont("helvetica", "bold"); doc.text("Remarks", M, y); doc.setFont("helvetica", "normal"); const t = doc.splitTextToSize(pdfSafe(job.remarks), W - 2 * M); doc.text(t, M, y + 5); y += 6 + t.length * 4.2; }
  if (job.render) { need(10); doc.setTextColor(...PDF_ROSE); doc.text(pdfSafe("3D render: " + job.render), M, y); }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(...PDF_MUTED);
    doc.text("This quotation is an internal reference and subject to final confirmation.", M, 290);
    doc.text(p + " / " + pages, W - M, 290, { align: "right" });
  }
  return doc;
}

import json, csv, io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = os.path.join(ROOT, "data", "catalog.tsv")
OUT = os.path.join(ROOT, "src", "data.js")

rows = []
with open(SRC, encoding="utf-8") as f:
    lines = f.read().split("\n")
for i, line in enumerate(lines):
    if i == 0 or not line.strip():
        continue
    p = line.split("\t")
    p += [""] * (5 - len(p))
    code, shape, size, wt, grp = [x.strip() for x in p[:5]]
    wt_v = float(wt) if wt else None
    rows.append([code, shape, size, wt_v, grp])

catalog_js = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))

static = r'''
const SSP_COLS = ["TW VS","TW SI1","TW SI2","TW SI3","TW I1","WH SI","IJ SI2-I1","LGD"];

const DEFAULT_RATES = {
  spot: {
    gold:     { oz: 4144.55, markup: 1.12, gm: 149.26, asOf: "Mon 28 Sep 2026 PM" },
    platinum: { oz: 1731.85, markup: 1.17, gm: 65.15,  asOf: "Mon 28 Sep 2026" },
    silver:   { oz: 61.33,   markup: 1.17, gm: 2.31,   asOf: "Mon 28 Sep 2026" }
  },
  metals: [
    { name: "9KT", k: 0.38 }, { name: "10KT", k: 0.42 }, { name: "14KT", k: 0.583 },
    { name: "18KT", k: 0.75 }, { name: "22KT", k: 0.92 },
    { name: "Platinum", k: 0.95 }, { name: "Silver", k: 1 }
  ],
  colors: [
    { name: "WHITE", s: 0 }, { name: "WHITE-PD", s: 5 }, { name: "YELLOW", s: 0 }, { name: "ROSE", s: 0 }
  ],
  tiers: [
    { name: "Tier 1", limit: null, base: 100, extra: null },
    { name: "Tier 2", limit: null, base: 130, extra: null },
    { name: "Tier 3", limit: null, base: 160, extra: null },
    { name: "Tier 4", limit: 11,   base: 190, extra: 17 },
    { name: "Tier 5", limit: 12,   base: 210, extra: 17 }
  ],
  sspCols: SSP_COLS,
  ssp: {
    R00: [470,450,410,390,350,370,340,150],
    R02: [420,400,370,350,320,330,300,100],
    R09: [540,520,470,450,410,430,365,100],
    R11: [550,530,480,460,420,430,390,100],
    R12: [650,620,560,540,480,490,435,100],
    R14: [770,710,650,630,550,550,495,100],
    R18: [770,710,650,630,550,550,495,100],
    R20: [850,790,730,690,610,580,535,100],
    R23: [920,840,790,750,650,620,575,100],
    R25: [920,840,790,750,650,620,575,100],
    R30: [950,850,810,780,660,650,615,100],
    R38: [1080,930,830,790,700,670,640,100],
    R40: [1120,950,850,800,720,680,650,100],
    R46: [1150,990,900,830,740,740,705,100],
    R50: [1200,1000,910,850,770,760,715,100],
    R60: [1300,1050,920,900,790,780,740,100],
    R70: [null,null,1200,1100,950,900,860,100],
    R75: [null,null,1200,1100,950,900,860,100],
    R80: [null,null,1300,1200,1050,1050,1000,100]
  },
  fx: [
    { cur: "USD", rate: 1,    alt: 1 },
    { cur: "EUR", rate: 1.14, alt: 1.08 },
    { cur: "AUD", rate: 0.70, alt: 0.67 },
    { cur: "NZD", rate: 0.57, alt: 0.54 },
    { cur: "GBP", rate: 1.32, alt: 1.26 },
    { cur: "PLN", rate: 0.26, alt: 0.25 }
  ],
  fxUse: "rate",
  locations: [
    { code: "WSSY", cur: "AUD", duty: 0 }
  ],
  cipher: { from: "1234567890", to: "JADELIGHTX" }
};

/* Reference tables (read-only) */
const ALLOYS = [
  ["Silver","Ag 925","92.96%","Ag (92.96%), Cu (6.69%), Zn (0.35%)",1.12],
  ["Platinum","PT 950","95.20%","Pt (95.20%), Ag (2.72%), Cu (1.49%), Zn (0.59%)",1.17],
  ["Yellow Gold","22K","91.66%","Au (91.66%), Ag (1.61%), Cu (5.79%), Zn (0.94%)",1.12],
  ["Yellow Gold","18K","75%","Au (75%), Cu (12.9%), Ag (10.1%), Other (2%)",1.12],
  ["Yellow Gold","18K","75.15%","Au (75.15%), Ag (12.35%), Cu (11.43%), Zn (1.07%)",1.12],
  ["Yellow Gold","14K","58.33%","Au (58.33%), Cu (21.5%), Ag (16.8%), Other (3.37%)",1.12],
  ["Yellow Gold","14K","58.70%","Au (58.70%), Ag (7.43%), Cu (26.43%), Zn (7.43%)",1.12],
  ["Yellow Gold","9K","37.60%","Au (37.6%), Cu (42.2%), Ag (14.33%), Other (5.87)",1.12],
  ["Yellow Gold","9K","37.70%","Au (37.70%), Ag (14.33%), Cu (40.50%), Zn (7.48%)",1.12],
  ["Rose Gold","18K","75%","Au (75%), Cu (23.2%), Ag (1%)",1.12],
  ["Rose Gold","18K","75.15%","Au (75.15%), Ag (14.41%), Cu (9.44%), Zn (0.99%)",1.12],
  ["Rose Gold","14K","58.33%","Au (58.33%), Cu (39.5%), Ag (2.17%)",1.12],
  ["Rose Gold","14K","58.70%","Au (58.70%), Ag (1.76%), Cu (38.26%), Zn (1.28%)",1.12],
  ["Rose Gold","9K","37.30%","Au (37.30%), Ag (1.55%), Cu (58.57%), Zn (2.18%)",1.12],
  ["Palladium White Gold","18K","75%","Au (75.00%), Ag (0.25%), Cu (7.55%), Zn (2.63%), Pd (-14.56%)",1.17],
  ["Palladium White Gold","18K","75.01%","Au (75.01%), Ag (13.27%), Cu (2.45%), Zn (2%), Pd (7.27%)",1.17],
  ["Palladium White Gold","14K","58.70%","Au (58.7%), Ag (16.93%), Cu (6.2%), Zn (2.89%), Pd (15.28%)",1.17],
  ["Palladium White Gold","14K","58.36%","Au (58.36%), Ag (22.1%), Cu (4.08%), Zn (3.33%), Pd (-12.12%)",1.17],
  ["Nickel free White Gold","9K","37.70%","Au (37.70%), Ag (51.96%), Cu (2.87%), Zn (7.48%)",1.12],
  ["Nickel free White Gold","9K","37.51%","Au (37.51%), Ag (43.75%), Cu (9.37%), Zn (9.37%)",1.12],
  ["Nickel free White Gold","10K","41.90%","Au (41.9%), Ag (48.46%), Cu (2.67%), Zn (6.97%)",1.12]
];

const CONV_KEYS = ["PT","18","14","10","9","SS"];
const CONV = [
  [1.00,0.70,0.60,0.53,0.53,0.48],
  [1.42,1.00,0.85,0.76,0.75,0.68],
  [1.66,1.17,1.00,0.89,0.88,0.80],
  [1.88,1.32,1.13,1.00,0.99,0.90],
  [1.90,1.34,1.14,1.01,1.00,0.92],
  [2.07,1.46,1.25,1.11,1.09,1.00]
];

const SHAPE_ORDER = ["Round","Baguette","Carre","Emerald","Heart","Marquise","Oval","Princess","Pear","Radiant","Single Cut","Sq. Cushion","Sq. Emerald","Tappered Bagguette","Triangle","Trilliant"];
const STONE_TYPES = ["Mined","Lab grown","CZ","Mount","Semi-Mount","Cabochon","Color","Opal","Alexandrite","Ametrine","Amethyst","Aquamarine","Citrine","Emerald","Garnet","Hessonite Garnet","Iolite","Morganite","Pearl","Peridot","Ruby","Sapphire","Spinel","Tanzanite","Topaz","Tourmaline","Zircon"];
const NATURAL_GRADES = ["TW VS","TW SI1","TW SI2","TW SI3","TW I1","WH SI","IJ SI2-I1"];
const LGD_GRADE_OPTS = [["SSP","LGD melee (SSP grid)"],["NONCERT","Non-cert"],["D/VVS2","Cert D/VVS2"],["EF/VVS2","Cert EF/VVS2"],["D/VS","Cert D/VS"],["EF/VS","Cert EF/VS"]];
const LGD_COLS = ["D/VVS2","EF/VVS2","D/VS","EF/VS"];
const LGD_NONCERT = [
  { shape: "Round", band: "0.002 - 0.009 ct", lo: 0.002, hi: 0.009, p: [135,135,135,135] },
  { shape: "Round", band: "0.01 - 0.99 ct",   lo: 0.01,  hi: 0.99,  p: [100,100,100,100] },
  { shape: "Fancy", band: "0.01 - 0.49 ct",   lo: 0.01,  hi: 0.49,  p: [200,200,200,200] }
];
const LGD_CERT = [
  { band: "0.50 - 0.99 ct (fancy)", lo: 0.5,  hi: 0.99,  fancyOnly: true, p: [200,175,200,175] },
  { band: "1.00 - 1.49 ct", lo: 1,    hi: 1.49,  p: [140,null,130,120] },
  { band: "1.50 - 1.99 ct", lo: 1.5,  hi: 1.99,  p: [170,null,140,130] },
  { band: "2.00 - 3.99 ct", lo: 2,    hi: 3.99,  p: [190,null,150,140] },
  { band: "4.00 ct and up", lo: 4,    hi: 9999,  p: [280,null,220,210] }
];
'''

with open(OUT, "w", encoding="utf-8") as f:
    f.write("const CATALOG = " + catalog_js + ";\n")
    f.write(static)

print(len(rows), "catalog rows")
dups = {}
for r in rows:
    dups.setdefault(r[0], 0)
    dups[r[0]] += 1
print("duplicate codes:", {k: v for k, v in dups.items() if v > 1})
print("no weight:", [r[0] for r in rows if r[3] is None][:12], "...", sum(1 for r in rows if r[3] is None))
print("groups:", sorted({r[4] for r in rows if r[4]}))

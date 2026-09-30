# Phoenix Calculator

Quote calculator for Phoenix pricing (Australian rate sheets). It is the sibling of the JWY Calculator and follows its layout and workflow, with one difference: **Phoenix is priced by tier**, not by itemised casting, labour and setting.

- Location **WSSY**, currency **AUD**, 0% duty
- Gross = metal + tier charge + diamonds (+ additional charge). Casting, labour, setting and CAD are inside the tier.
- The tier is picked by hand (Tier 1 to Tier 5). Tiers 4 and 5 add a per-gram charge above a weight limit.
- Local total = gross ÷ 0.70 (USD→AUD), rounded up to the next $5. The final price can be overridden.
- Stone rows: Type, Shape, Size and Quality each have a **Custom entry…** option that turns the cell into a text box.
- Same outputs as JWY: **Download** PDF (full / price only / no price), **Preview**, **Sync to DB**, **Save to Drive**, **Export to GATI** (214-column xlsx), **Email**.
- CAD input works the same way as JWY: the CAD Order Form's **Export Order Data** JSON is loaded with **Load order data** (`samples/sample-order.json` shows the shape).

The whole app is one static HTML page (`dist/index.html`) plus five small Netlify functions for the database, email and Drive settings.

## How it fits together

```
Browser (dist/index.html)
 ├─ pricing, PDF, GATI xlsx ............ all in the browser, no server needed
 ├─ Download / Export to GATI .......... browser file download
 ├─ Save to Drive ...................... Google sign-in in the browser, uploads straight to Drive (scope drive.file)
 └─ Sync to DB / search / Email ........ Netlify functions
        ├─ Netlify Database (Postgres) . index of saved quotes (job, item, stage, customer, tier, total)
        ├─ Netlify Blobs ............... each quote's PDF + JSON snapshot
        └─ Resend ....................... email with the PDF attached
```

`src/web-adapter.js` is what connects the page to those services. It supplies the same three hooks (`downloads`, `db`, `mcp`) that claude.ai supplies to the Claude-artifact version of this calculator, so `src/app.js` is identical in both.

## Repo layout

| Path | What it is |
| --- | --- |
| `src/app.js` | The interface: sections 01–07, stone table, quotes toolbar |
| `src/engine.js` | Pricing maths and CAD-order parsing (pure functions) |
| `src/export.js` | PDF layout and GATI workbook |
| `src/data.js` | **Generated** rate book and stone catalogue (see "Changing rates") |
| `src/web-adapter.js` | Browser ↔ Netlify / Google glue (only in the website build) |
| `src/style.css` | Atelier Rose styling, same tokens as JWY |
| `tools/build.mjs` | Bundles everything into one HTML file |
| `tools/gen_data.py` | Regenerates `src/data.js` from `data/catalog.tsv` and the rate tables inside it |
| `data/catalog.tsv` | The stone catalogue (419 rows) |
| `netlify/functions/` | `save-quote`, `load-quote`, `search-quotes`, `send-quote-email`, `app-config` |
| `netlify/lib/quotes.mjs` | The server logic behind those functions (unit-tested) |
| `netlify/database/migrations/` | Database schema, applied by Netlify on deploy |
| `tests/` | Engine, browser and server tests |
| `DEPLOY.md` | **Step-by-step: GitHub → Netlify → database → email → Drive** |

## Run it

```bash
npm install
npm run build          # writes dist/index.html
open dist/index.html   # pricing, PDF and GATI export work with no server
```

For the full app locally (database, email, Drive) copy `.env.example` to `.env`, fill in what you have, and run `npm run dev` (needs the Netlify CLI: `npm i -g netlify-cli`).

## Tests

```bash
npm test
```

Runs the production build, then:

- **engine** (69 checks): pricing against the worked sample job, tiers, rounding, custom entries, CAD-order import
- **smoke** (44 checks): the Claude-artifact build in a simulated browser, every button
- **web adapter** (30 checks): the website build in a simulated browser, talking to the real server code on an in-process Postgres: access-key prompt, save, duplicate stage refusal, search and reload, email, Drive upload and token refresh, offline and misconfigured-server messages
- **functions** (44 checks): the server code and the migration file on Postgres, including two people saving the same Job/Item/Stage at once

These use fakes for Netlify Blobs, Resend and Google, so they prove the logic, not your live accounts. `DEPLOY.md` ends with a short live checklist for that.

## Changing rates

`src/data.js` is generated, so edit the source instead and regenerate:

- Tier prices, karat factors, colour surcharges, SSP grid, exchange rate: the `DEFAULT_RATES` block in `tools/gen_data.py`
- Stone catalogue: `data/catalog.tsv`
- Then `npm run data && npm run build`, commit, push. Netlify redeploys.

**Spot metal prices** (section 03, Rate book) can also be typed into the page. That value is remembered **per browser**, not shared. If everyone should start from the same spot price, put it in `DEFAULT_RATES.spot` and redeploy.

## Claude artifact build

`npm run build:artifact` writes `build/phoenix-artifact.html`, the same calculator without the web adapter, for publishing as a Claude artifact. Inside claude.ai, Sync to DB uses the artifact's own database, Save to Drive uses the Google Drive connector, and Email uses Gmail.

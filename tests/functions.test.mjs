// Server tests: the real SQL runs on an in-process Postgres (PGlite); blob storage and Resend are faked.
import { PGlite } from "@electric-sql/pglite";
import { createQuoteApi, safeBase } from "../netlify/lib/quotes.mjs";
import { readFileSync } from "node:fs";

let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  " + (extra || ""))); };

const pg = new PGlite();
const sql = async (strings, ...values) => {
  let text = strings[0];
  values.forEach((v, i) => { text += "$" + (i + 1) + strings[i + 1]; });
  return (await pg.query(text, values)).rows;
};
const blobs = new Map();
let blobFail = false;
const store = {
  async set(k, v) { if (blobFail) throw new Error("blob store down"); blobs.set(k, v); },
  async get(k) { return blobs.has(k) ? blobs.get(k) : null; }
};
const mails = [];
let mailResult = { data: { id: "em_1" }, error: null };
const KEY = "correct horse battery";
const make = env => createQuoteApi({ getSql: () => sql, getStore: () => store, sendMail: async p => { mails.push(p); return mailResult; }, env });
const api = make({ APP_ACCESS_KEY: KEY, RESEND_API_KEY: "re_x", GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_DRIVE_FOLDER_ID: "fold123" });

const req = (path, { method = "GET", body, key = KEY } = {}) =>
  new Request("https://site.test/.netlify/functions/" + path, { method, headers: Object.assign({ "content-type": "application/json" }, key == null ? {} : { "x-access-key": key }), body: body ? JSON.stringify(body) : undefined });
const j = async r => ({ status: r.status, body: await r.json() });
const pdf = Buffer.from("%PDF-1.4 test pdf bytes").toString("base64");
const quote = (o = {}) => Object.assign({ filenameBase: "4376_B00630_Q1_20260930-101500", jobNo: "4376", itemNo: "B00630", stage: "Q1", customer: "Acme Jewellers", designer: "Sudip", tier: "Tier 2", cur: "AUD", total: 2300, pdfBase64: pdf, json: JSON.stringify({ job: { jobNo: "4376" } }) }, o);

(async () => {
  console.log("-- migration file");
  const migPg = new PGlite();
  await migPg.exec(readFileSync(new URL("../netlify/database/migrations/20260930000000_quotes/migration.sql", import.meta.url), "utf8"));
  const migSql = async (strings, ...values) => { let t = strings[0]; values.forEach((v, i) => { t += "$" + (i + 1) + strings[i + 1]; }); return (await migPg.query(t, values)).rows; };
  const migApi = createQuoteApi({ getSql: () => migSql, getStore: () => store, sendMail: async () => ({}), env: { APP_ACCESS_KEY: KEY } });
  const viaMig = await j(await migApi.save(req("save-quote", { method: "POST", body: quote({ filenameBase: "mig_1" }) })));
  const dupMig = await j(await migApi.save(req("save-quote", { method: "POST", body: quote({ filenameBase: "mig_2" }) })));
  ok("the migration file alone is enough for save to work (same schema as the app creates)", viaMig.status === 200 && dupMig.status === 409, JSON.stringify([viaMig, dupMig]));
  ok("running the app's own schema step on top of the migration is harmless", (await j(await migApi.search(req("search-quotes?recent=1")))).body.results.length === 1);

  console.log("-- config + access key");
  const cfg = await j(await api.config());
  ok("config is public and shows what is configured", cfg.status === 200 && cfg.body.googleClientId === "cid.apps.googleusercontent.com" && cfg.body.driveFolderId === "fold123" && cfg.body.email === true && cfg.body.locked === true);
  ok("config never leaks the key or the API key", !JSON.stringify(cfg.body).includes(KEY) && !JSON.stringify(cfg.body).includes("re_x"));
  ok("no key header -> 401", (await j(await api.search(req("search-quotes?recent=1", { key: null })))).status === 401);
  ok("wrong key -> 401", (await j(await api.search(req("search-quotes?recent=1", { key: "nope" })))).status === 401);
  ok("save is locked too", (await j(await api.save(req("save-quote", { method: "POST", body: quote(), key: "nope" })))).status === 401);
  ok("email is locked too", (await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "a@b.co", filenameBase: "x", pdfBase64: pdf }, key: null })))).status === 401);
  const open = make({});
  const locked = await j(await open.search(req("search-quotes?recent=1", { key: null })));
  ok("no APP_ACCESS_KEY configured -> fails closed (503)", locked.status === 503 && /APP_ACCESS_KEY/.test(locked.body.error));
  const dev = make({ NETLIFY_DEV: "true" });
  ok("netlify dev works without a key", (await j(await dev.search(req("search-quotes?recent=1", { key: null })))).status === 200);

  console.log("-- save");
  ok("GET on save -> 405", (await j(await api.save(req("save-quote")))).status === 405);
  ok("missing fields -> 400", (await j(await api.save(req("save-quote", { method: "POST", body: { jobNo: "1" } })))).status === 400);
  const s1 = await j(await api.save(req("save-quote", { method: "POST", body: quote() })));
  ok("first save -> 200", s1.status === 200 && s1.body.ok === true, JSON.stringify(s1));
  ok("PDF and JSON stored under <filename>/", Buffer.from(blobs.get("4376_B00630_Q1_20260930-101500/quote.pdf")).toString().startsWith("%PDF") && JSON.parse(blobs.get("4376_B00630_Q1_20260930-101500/quote.json")).job.jobNo === "4376");
  const rows = await sql`SELECT * FROM phoenix_quotes`;
  ok("index row holds job/item/stage/customer/tier/total", rows.length === 1 && rows[0].job_no === "4376" && rows[0].item_no === "B00630" && rows[0].quote_stage === "Q1" && rows[0].customer === "Acme Jewellers" && rows[0].tier === "Tier 2" && Number(rows[0].total) === 2300 && rows[0].currency === "AUD");
  const dup = await j(await api.save(req("save-quote", { method: "POST", body: quote({ filenameBase: "4376_B00630_Q1_20260930-101600" }) })));
  ok("same Job/Item/Stage -> 409 with the update-your-stage message", dup.status === 409 && /update your quotation stage.*Q1.*Job 4376 \/ Item B00630/.test(dup.body.error), JSON.stringify(dup));
  ok("refused duplicate stored nothing", !blobs.has("4376_B00630_Q1_20260930-101600/quote.pdf") && (await sql`SELECT * FROM phoenix_quotes`).length === 1);
  const q2 = await j(await api.save(req("save-quote", { method: "POST", body: quote({ stage: "Q2", filenameBase: "4376_B00630_Q2_20260930-102000", total: 2450 }) })));
  ok("bumping the stage saves", q2.status === 200);
  const race = await Promise.all([1, 2].map(i => api.save(req("save-quote", { method: "POST", body: quote({ stage: "Q3", filenameBase: "race_" + i }) })).then(j)));
  ok("two people saving the same slot at once: exactly one wins", race.map(r => r.status).sort().join() === "200,409", JSON.stringify(race));
  const blankA = await j(await api.save(req("save-quote", { method: "POST", body: quote({ jobNo: "", itemNo: "", stage: "", filenameBase: "quote_20260930-1" }) })));
  const blankB = await j(await api.save(req("save-quote", { method: "POST", body: quote({ jobNo: "", itemNo: "", stage: "", filenameBase: "quote_20260930-2" }) })));
  ok("blank Job/Item may repeat", blankA.status === 200 && blankB.status === 200);
  const same = await j(await api.save(req("save-quote", { method: "POST", body: quote({ jobNo: "", itemNo: "", stage: "", filenameBase: "quote_20260930-2" }) })));
  ok("same filename twice is refused (409)", same.status === 409);
  blobFail = true;
  const bf = await j(await api.save(req("save-quote", { method: "POST", body: quote({ stage: "Q9", filenameBase: "will_fail" }) })));
  blobFail = false;
  ok("blob failure -> 500 and the index row is rolled back", bf.status === 500 && (await sql`SELECT * FROM phoenix_quotes WHERE filename_base = 'will_fail'`).length === 0, JSON.stringify(bf));
  const retry = await j(await api.save(req("save-quote", { method: "POST", body: quote({ stage: "Q9", filenameBase: "will_fail" }) })));
  ok("after a failed save the same stage can be saved again", retry.status === 200, JSON.stringify(retry));
  ok("safeBase strips separators and dot-runs", safeBase("../../etc/passwd x") === "-.-etc-passwd-x" && safeBase("a/b\\c") === "a-b-c" && safeBase("..") === "" && safeBase("4376_B00630_Q1_20260930-101500") === "4376_B00630_Q1_20260930-101500");
  const evil = await j(await api.save(req("save-quote", { method: "POST", body: quote({ stage: "QE", filenameBase: "../../evil/name" }) })));
  ok("path tricks cannot escape the quote folder", evil.status === 200 && [...blobs.keys()].every(k => k.split("/").length === 2 && !k.split("/").includes("..") && !k.startsWith("/")), [...blobs.keys()].join());

  console.log("-- load");
  const ld = await api.load(req("load-quote?filenameBase=4376_B00630_Q1_20260930-101500"));
  ok("load returns the saved snapshot", ld.status === 200 && (await ld.json()).job.jobNo === "4376");
  ok("unknown quote -> 404", (await j(await api.load(req("load-quote?filenameBase=nothing")))).status === 404);
  ok("missing name -> 400", (await j(await api.load(req("load-quote")))).status === 400);

  console.log("-- search");
  const byJob = (await j(await api.search(req("search-quotes?q=4376")))).body.results;
  ok("search by job # (newest first)", byJob.length >= 2 && byJob[0].quote_stage !== "Q1" && byJob.every(r => r.job_no === "4376") && new Date(byJob[0].created_at) >= new Date(byJob[1].created_at));
  ok("search by item # is case-insensitive and partial", (await j(await api.search(req("search-quotes?q=b006")))).body.results.length >= 2);
  ok("search by customer", (await j(await api.search(req("search-quotes?q=acme")))).body.results.length >= 2);
  ok("result rows carry what the app needs", ["id", "job_no", "item_no", "quote_stage", "filename_base", "customer", "tier", "currency", "total", "created_at"].every(k => k in byJob[0]));
  ok("under 2 characters -> empty", (await j(await api.search(req("search-quotes?q=4")))).body.results.length === 0);
  ok("wildcards match literally (a lone % or _ finds nothing)", (await j(await api.search(req("search-quotes?q=%25%25")))).body.results.length === 0 && (await j(await api.search(req("search-quotes?q=__")))).body.results.length === 0);
  const recent = (await j(await api.search(req("search-quotes?recent=1&limit=3")))).body.results;
  ok("recent honours the limit", recent.length === 3);
  ok("SQL-injection style input is just text", (await j(await api.search(req("search-quotes?q=" + encodeURIComponent("'; DROP TABLE phoenix_quotes;--"))))).status === 200 && (await sql`SELECT count(*)::int AS n FROM phoenix_quotes`)[0].n > 0);

  console.log("-- email");
  ok("GET on email -> 405", (await j(await api.email(req("send-quote-email")))).status === 405);
  const noKeyApi = make({ APP_ACCESS_KEY: KEY });
  ok("no RESEND_API_KEY -> clear message", /RESEND_API_KEY/.test((await j(await noKeyApi.email(req("send-quote-email", { method: "POST", body: { to: "a@b.co", filenameBase: "x", pdfBase64: pdf } })))).body.error));
  ok("bad recipient -> 400", (await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "nope", filenameBase: "x", pdfBase64: pdf } })))).status === 400);
  ok("missing pdf -> 400", (await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "a@b.co", filenameBase: "x" } })))).status === 400);
  ok("oversized pdf -> 413", (await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "a@b.co", filenameBase: "x", pdfBase64: "A".repeat(5.6e6) } })))).status === 413);
  const em = await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "client@example.com", subject: "Your Quotation - 4376", message: "Hi", html: "<p>Hi</p>", filenameBase: "4376_B00630_Q1", pdfBase64: pdf } })));
  const m = mails[mails.length - 1];
  ok("email sent via Resend with the PDF attached", em.status === 200 && em.body.id === "em_1" && m.to[0] === "client@example.com" && m.attachments[0].filename === "4376_B00630_Q1.pdf" && m.attachments[0].content === pdf && m.subject === "Your Quotation - 4376" && m.html === "<p>Hi</p>");
  ok("default sender is the Resend sandbox address until RESEND_FROM_ADDRESS is set", /onboarding@resend\.dev/.test(m.from));
  mailResult = { data: null, error: { message: "domain not verified" } };
  ok("Resend error is passed back", (await j(await api.email(req("send-quote-email", { method: "POST", body: { to: "client@example.com", filenameBase: "x", pdfBase64: pdf } })))).body.error === "domain not verified");

  // Database selection: Netlify Database, or Neon (what the JWY calculator uses)
  const { chooseSql } = await import("../netlify/lib/sql.mjs");
  const loaders = { netlifyDatabase: () => "netlify-db", neon: () => "neon" };
  ok("NETLIFY_DB_URL -> Netlify Database", chooseSql({ NETLIFY_DB_URL: "x" }, loaders) === "netlify-db");
  ok("only NETLIFY_DATABASE_URL -> Neon (same as JWY)", chooseSql({ NETLIFY_DATABASE_URL: "x" }, loaders) === "neon");
  ok("both set -> Netlify Database wins", chooseSql({ NETLIFY_DB_URL: "x", NETLIFY_DATABASE_URL: "y" }, loaders) === "netlify-db");
  ok("neither set -> Netlify Database's own clear error", chooseSql({}, loaders) === "netlify-db");
  const rt = await import("../netlify/lib/runtime.mjs");
  ok("runtime wiring loads with both database packages", typeof rt.api.save === "function" && typeof rt.api.config === "function");

  console.log(fails ? "\n" + fails + " FAILED" : "\nall server checks passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

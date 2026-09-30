// Server logic for the Phoenix calculator. Kept free of Netlify imports so it can be tested:
// each function file in netlify/functions/ is a thin wrapper that passes in the real database, blob store and mailer.
import crypto from "node:crypto";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };
export const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// Blob keys and filenames come from the browser, so reduce them to a safe alphabet.
export const safeBase = s => String(s || "").replace(/[^\w.\-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+/, "").slice(0, 120);
const text = (v, max = 200) => String(v == null ? "" : v).slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Escape LIKE wildcards so a search for "B_1" or "50%" matches literally.
const likeEscape = s => s.replace(/[\\%_]/g, m => "\\" + m);

const same = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Every statement is IF NOT EXISTS, so running this on each cold start is safe (and means there is no manual SQL step).
// Mirrors netlify/database/migrations/20260930000000_quotes/migration.sql (a test checks the two stay compatible).
async function createSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS phoenix_quotes (
    id SERIAL PRIMARY KEY,
    job_no TEXT NOT NULL DEFAULT '',
    item_no TEXT NOT NULL DEFAULT '',
    quote_stage TEXT NOT NULL DEFAULT '',
    filename_base TEXT NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    designer TEXT NOT NULL DEFAULT '',
    tier TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT '',
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_phoenix_quotes_job_item_stage ON phoenix_quotes (job_no, item_no, quote_stage) WHERE job_no <> '' AND item_no <> ''`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_phoenix_quotes_filename ON phoenix_quotes (filename_base)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_job_no ON phoenix_quotes (job_no)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_item_no ON phoenix_quotes (item_no)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_created ON phoenix_quotes (created_at DESC)`;
}

/**
 * deps = {
 *   getSql:   () => tagged-template SQL function (Netlify DB / Neon),
 *   getStore: () => blob store ({ set, get, delete }),
 *   sendMail: async payload => ({ data, error }),    // Resend-shaped
 *   env:      process.env-like object
 * }
 */
export function createQuoteApi(deps) {
  const env = deps.env || {};
  let schemaReady = null;

  const sqlReady = async () => {
    const sql = deps.getSql();
    // Runs once per warm function instance.
    schemaReady = schemaReady || createSchema(sql).catch(e => { schemaReady = null; throw e; });
    await schemaReady;
    return sql;
  };

  // Every action except config needs the team access key. Fail closed: with no key configured the functions stay locked,
  // otherwise anyone who finds the site could send email from your Resend account or fill the database.
  const locked = req => {
    if (env.NETLIFY_DEV === "true") return null;
    if (!env.APP_ACCESS_KEY) return reply(503, { error: "APP_ACCESS_KEY is not set on this site. Add it in Netlify > Site configuration > Environment variables, then redeploy." });
    if (!same(req.headers.get("x-access-key") || "", env.APP_ACCESS_KEY)) return reply(401, { error: "Access key required." });
    return null;
  };

  const guarded = handler => async req => {
    const denied = locked(req); if (denied) return denied;
    try { return await handler(req); }
    catch (err) { return reply(500, { error: (err && err.message) || String(err) }); }
  };

  return {
    // Public: which optional features are switched on, plus the (public) Google OAuth client id and Drive folder id.
    config: async () => reply(200, {
      googleClientId: env.GOOGLE_CLIENT_ID || null,
      driveFolderId: env.GOOGLE_DRIVE_FOLDER_ID || null,
      email: !!env.RESEND_API_KEY,
      locked: !!env.APP_ACCESS_KEY
    }),

    // Sync to DB. One row per Job # + Item # + Stage; a repeat is refused so the user bumps the stage (Q1 -> Q2).
    save: guarded(async req => {
      if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
      const b = await req.json();
      const base = safeBase(b.filenameBase);
      if (!base || !b.pdfBase64 || !b.json) return reply(400, { error: "Missing required fields" });
      const jobNo = text(b.jobNo, 80), itemNo = text(b.itemNo, 80), stage = text(b.stage, 40);
      const total = Number.isFinite(Number(b.total)) ? Number(b.total) : 0;
      const sql = await sqlReady();
      // The insert claims the Job/Item/Stage slot atomically (unique index), so two people saving at once cannot both win.
      const claimed = await sql`
        INSERT INTO phoenix_quotes (job_no, item_no, quote_stage, filename_base, customer, designer, tier, currency, total)
        VALUES (${jobNo}, ${itemNo}, ${stage}, ${base}, ${text(b.customer)}, ${text(b.designer)}, ${text(b.tier, 40)}, ${text(b.cur, 8)}, ${total})
        ON CONFLICT DO NOTHING
        RETURNING id`;
      if (!claimed.length) {
        const dupe = jobNo && itemNo
          ? await sql`SELECT id FROM phoenix_quotes WHERE job_no = ${jobNo} AND item_no = ${itemNo} AND quote_stage = ${stage} LIMIT 1`
          : [];
        return reply(409, { error: dupe.length
          ? `Please update your quotation stage before saving -- ${stage || "this stage"} already exists in the database for Job ${jobNo} / Item ${itemNo}.`
          : "A quote with this file name was already saved. Try again in a moment." });
      }
      try {
        const store = deps.getStore();
        await store.set(`${base}/quote.pdf`, Uint8Array.from(Buffer.from(b.pdfBase64, "base64")), { metadata: { type: "pdf" } });
        await store.set(`${base}/quote.json`, String(b.json), { metadata: { type: "json" } });
      } catch (err) {
        await sql`DELETE FROM phoenix_quotes WHERE id = ${claimed[0].id}`; // don't leave an index row that points at nothing
        throw err;
      }
      return reply(200, { ok: true, filenameBase: base });
    }),

    // Reload a saved quote: returns the snapshot JSON exactly as it was saved.
    load: guarded(async req => {
      const base = safeBase(new URL(req.url).searchParams.get("filenameBase"));
      if (!base) return reply(400, { error: "Missing filenameBase" });
      const stored = await deps.getStore().get(`${base}/quote.json`);
      if (stored == null) return reply(404, { error: "Quote not found" });
      return new Response(String(stored), { status: 200, headers: JSON_HEADERS });
    }),

    // Search by Job #, Item # or customer (newest first). ?recent=1 lists the latest quotes instead.
    search: guarded(async req => {
      const u = new URL(req.url);
      const q = (u.searchParams.get("q") || "").trim();
      const recent = u.searchParams.get("recent") === "1";
      const limit = Math.min(100, Math.max(1, parseInt(u.searchParams.get("limit") || "25", 10) || 25));
      if (!recent && q.length < 2) return reply(200, { results: [] });
      const sql = await sqlReady();
      const like = "%" + likeEscape(q) + "%";
      const rows = recent
        ? await sql`SELECT id, job_no, item_no, quote_stage, filename_base, customer, designer, tier, currency, total, created_at
                    FROM phoenix_quotes ORDER BY created_at DESC LIMIT ${limit}`
        : await sql`SELECT id, job_no, item_no, quote_stage, filename_base, customer, designer, tier, currency, total, created_at
                    FROM phoenix_quotes
                    WHERE job_no ILIKE ${like} OR item_no ILIKE ${like} OR customer ILIKE ${like}
                    ORDER BY created_at DESC LIMIT ${limit}`;
      return reply(200, { results: rows });
    }),

    // Email the PDF via Resend.
    email: guarded(async req => {
      if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
      if (!env.RESEND_API_KEY) return reply(500, { error: "RESEND_API_KEY is not set on this site yet -- see DEPLOY.md." });
      const b = await req.json();
      const to = text(b.to, 254).trim(), base = safeBase(b.filenameBase);
      if (!EMAIL.test(to)) return reply(400, { error: "Enter a valid recipient email address." });
      if (!base || !b.pdfBase64) return reply(400, { error: "Missing required fields (to, filenameBase, pdfBase64)" });
      if (String(b.pdfBase64).length > 5.5e6) return reply(413, { error: "The PDF is too large to email (limit about 4 MB). Use Price only / No price, or fewer CAD images." });
      const { data, error } = await deps.sendMail({
        from: env.RESEND_FROM_ADDRESS || "Phoenix Quotes <onboarding@resend.dev>",
        to: [to],
        subject: text(b.subject, 200) || `Quotation - ${base}`,
        text: text(b.message, 4000) || "Please find the attached quotation.",
        html: b.html ? String(b.html).slice(0, 100000) : undefined,
        attachments: [{ filename: `${base}.pdf`, content: b.pdfBase64 }]
      });
      if (error) return reply(500, { error: error.message || String(error) });
      return reply(200, { ok: true, id: data && data.id });
    })
  };
}

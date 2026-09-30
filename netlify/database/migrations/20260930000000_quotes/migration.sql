-- Phoenix calculator: quote index (one row per saved quote; the PDF and JSON snapshot live in Netlify Blobs).
-- Netlify applies this automatically on deploy. The functions also run the same statements (IF NOT EXISTS) on first use,
-- so the app still works if migrations are ever skipped.
CREATE TABLE IF NOT EXISTS phoenix_quotes (
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
);

-- One quote per Job # + Item # + Stage (blank job/item values may repeat).
CREATE UNIQUE INDEX IF NOT EXISTS uq_phoenix_quotes_job_item_stage ON phoenix_quotes (job_no, item_no, quote_stage) WHERE job_no <> '' AND item_no <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_phoenix_quotes_filename ON phoenix_quotes (filename_base);
CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_job_no ON phoenix_quotes (job_no);
CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_item_no ON phoenix_quotes (item_no);
CREATE INDEX IF NOT EXISTS idx_phoenix_quotes_created ON phoenix_quotes (created_at DESC);

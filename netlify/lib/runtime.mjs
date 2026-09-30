// Wires the testable quote API (quotes.mjs) to the real Netlify services. Imported by every function file.
import { getDatabase } from "@netlify/database";
import { neon } from "@netlify/neon";
import { getStore } from "@netlify/blobs";
import { createQuoteApi } from "./quotes.mjs";
import { chooseSql } from "./sql.mjs";

export const api = createQuoteApi({
  env: process.env,
  // Netlify Database if the site has it, otherwise Neon (NETLIFY_DATABASE_URL), the same database the JWY calculator uses
  getSql: () => chooseSql(process.env, { netlifyDatabase: () => getDatabase().sql, neon: () => neon() }),
  getStore: () => getStore("phoenix-quotes"), // Netlify Blobs: <filenameBase>/quote.pdf and quote.json
  sendMail: async payload => {
    const { Resend } = await import("resend");
    return new Resend(process.env.RESEND_API_KEY).emails.send(payload);
  }
});

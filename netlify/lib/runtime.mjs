// Wires the testable quote API (quotes.mjs) to the real Netlify services. Imported by every function file.
import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import { createQuoteApi } from "./quotes.mjs";

export const api = createQuoteApi({
  env: process.env,
  getSql: () => getDatabase().sql,            // Netlify Database (Postgres), provisioned automatically on deploy
  getStore: () => getStore("phoenix-quotes"), // Netlify Blobs: <filenameBase>/quote.pdf and quote.json
  sendMail: async payload => {
    const { Resend } = await import("resend");
    return new Resend(process.env.RESEND_API_KEY).emails.send(payload);
  }
});

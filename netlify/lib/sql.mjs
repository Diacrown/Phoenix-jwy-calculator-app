// Picks the SQL connection, so Phoenix works on either kind of Netlify Postgres.
//   NETLIFY_DB_URL       -> Netlify Database (@netlify/database)
//   NETLIFY_DATABASE_URL -> Neon, added through the Netlify DB extension (@netlify/neon) -- what the JWY calculator uses
// Both return a tagged-template function that answers with an array of rows, which is all quotes.mjs needs.
export function chooseSql(env, loaders) {
  if (env.NETLIFY_DB_URL) return loaders.netlifyDatabase();
  if (env.NETLIFY_DATABASE_URL) return loaders.neon();
  return loaders.netlifyDatabase(); // nothing is configured: getDatabase() throws its own clear "no database" message
}

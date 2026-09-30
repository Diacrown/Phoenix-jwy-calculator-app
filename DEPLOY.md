# Deploying the Phoenix Calculator

Same shape as the JWY deployment, on its own Netlify site. Allow about 45 minutes the first time, mostly waiting on Google and Resend setup. Steps 1 to 3 give you a working calculator; steps 4 to 6 switch on email and Drive.

## What you connect

| Need | Service | Why | Cost note |
| --- | --- | --- | --- |
| Source code | **GitHub** | Netlify builds from the repo, and every push redeploys | Free |
| Hosting + functions | **Netlify** | Serves the page and runs the five functions | Free tier exists; check current function limits |
| Quote index | **Netlify Database** (Postgres) | Sync to DB, Job#/Item# search | Automatic with the site; check plan limits |
| Quote PDFs + JSON | **Netlify Blobs** | Saved PDF and snapshot for each quote | Automatic, nothing to set up |
| Email | **Resend** | Sends the PDF to a customer | Free tier exists; needs a verified domain to email customers |
| Save to Drive | **Google Cloud** (OAuth client) + a Drive folder | Staff sign in with Google; the PDF goes to one shared folder | Free |
| Access control | **`APP_ACCESS_KEY`** setting (+ optionally Netlify password protection) | Stops strangers using saving and email | Free (site-wide password protection is a paid Netlify feature) |
| Optional | Custom domain | `phoenix.yourcompany.com` | Domain cost only |

Keep this site **separate from JWY** (own Netlify site, own database, own Resend/Drive folder if you like). They share nothing, so a change to one cannot affect the other.

## 1. Put the code on GitHub

Create an empty repository (for example `Diacrown/phoenix-calculator-app`, private), then from this folder:

```bash
git init -b main
git add .
git commit -m "Phoenix calculator"
git remote add origin https://github.com/Diacrown/phoenix-calculator-app.git
git push -u origin main
```

`node_modules`, `dist`, `.env` and `build` are already ignored.

## 2. Create the Netlify site

1. Netlify → **Add new project** → **Import an existing project** → GitHub → choose the repository.
2. Build settings come from `netlify.toml` (build command `npm run build`, publish directory `dist`, functions `netlify/functions`). Leave them as they are.
3. Deploy. The first deploy also provisions the site's database and applies `netlify/database/migrations/` before publishing.
4. Open the site URL. The calculator loads; Download, Preview and Export to GATI already work. Sync to DB, Email and Drive show setup messages until you finish the steps below.

## 3. Set the access key (do this before sharing the link)

Netlify → **Project configuration → Environment variables → Add a variable**:

| Key | Value |
| --- | --- |
| `APP_ACCESS_KEY` | A long random string, for example the output of `openssl rand -base64 24` |

Mark it as a secret, then **trigger a new deploy** (environment changes apply on the next deploy).

The functions refuse every request without this key (they answer "locked" if it is missing), so nobody who finds the URL can send email from your Resend account or fill your database. The first time someone clicks Sync to DB, Email or search, the page asks for the key and remembers it in that browser. Give the key to your team the way you would a shared password.

**Be aware:** the rate tables are part of the page itself, so anyone who can open the URL can read them (the key protects saving, search and email, not the prices). If the prices must stay private, also put the whole site behind Netlify's password protection (paid plans), Cloudflare Access, or Netlify Identity. Do not copy JWY's hard-coded gate password: a password written in the page source is visible to everyone.

## 4. Email (Resend)

1. Create an account at resend.com → **API Keys** → create a key.
2. **Domains** → add your company domain and add the DNS records Resend shows. Until a domain is verified, Resend only lets you send to your own address.
3. Add to Netlify:

| Key | Value |
| --- | --- |
| `RESEND_API_KEY` | the key from step 1 (secret) |
| `RESEND_FROM_ADDRESS` | `Phoenix Quotes <quotes@your-domain.com>` (an address on the verified domain) |

4. Redeploy.

Limit: one email carries a PDF up to about 4 MB. If a quote with many CAD images is too large, the page says so; use "Price only" / "No price" or fewer images.

## 5. Save to Drive (Google)

1. Google Cloud console → create (or pick) a project → **APIs & Services → Library** → enable **Google Drive API**.
2. **OAuth consent screen**: choose *Internal* if your company uses Google Workspace, otherwise *External* and add your staff as *test users*. Add the scope `.../auth/drive.file`.
3. **Credentials → Create credentials → OAuth client ID → Web application**. Under *Authorized JavaScript origins* add your Netlify URL (`https://your-site.netlify.app`) and your custom domain if you have one. No redirect URI is needed.
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
5. In Google Drive create the folder quotes should land in. Open it and copy the ID from the address bar (the part after `/folders/`). Everyone who will save must be able to edit that folder.
6. Add to Netlify (both are public identifiers, not secrets):

| Key | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | the Client ID |
| `GOOGLE_DRIVE_FOLDER_ID` | the folder ID |

7. Redeploy.

The first Save to Drive of a session opens a Google sign-in popup; after that it is one click. The app can only touch files it creates itself (the narrow `drive.file` scope), never the rest of anyone's Drive.

### Shortcut: reuse the JWY calculator's settings

If the JWY calculator already saves to Drive and sends email, Phoenix can use the same accounts. In the **jwy-calculator** site's environment variables copy these into the Phoenix site:

| JWY site has | Phoenix site needs | Notes |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | Same value. Then in Google Cloud → Credentials → that OAuth client → **Authorized JavaScript origins**, add the Phoenix site URL. Without this Google refuses the sign-in popup. |
| `VITE_DRIVE_FOLDER_ID` | `GOOGLE_DRIVE_FOLDER_ID` | Same value puts Phoenix PDFs in the same folder. The narrow `drive.file` scope only works with a folder made through the same OAuth client, so a folder created by hand will not accept uploads. |
| `RESEND_API_KEY` | `RESEND_API_KEY` | Same value, mark it secret. |
| `RESEND_FROM_ADDRESS` (if set) | `RESEND_FROM_ADDRESS` | Same value. |
| not applicable | `APP_ACCESS_KEY` | New value, see step 3. JWY has no equivalent. |

**Database.** Phoenix uses whichever Postgres the site has: Netlify Database (`NETLIFY_DB_URL`), or Neon added through the Netlify DB extension (`NETLIFY_DATABASE_URL`, what JWY uses). The table `phoenix_quotes` is created on first save. In Netlify: **Extensions → Neon → add to this site** if the site has neither.

## 6. Check it end to end

Open the site and go through this once:

1. **Load order data** → choose `samples/sample-order.json` → the job, metal and stones fill in.
2. Click a tier; the totals change.
3. **Download** → a PDF opens and looks right. **Export to GATI** → an xlsx downloads.
4. Type a Job # and Item # → **Sync to DB** → enter the access key → "Synced". Click it again: it should refuse and ask you to bump the stage. Set the stage to Q2 and sync again.
5. Type the Job # in the search box → the quote appears → click it → the form restores.
6. **Email** → your own address → Send twice (confirm) → the PDF arrives.
7. **Save to Drive** → Google sign-in → the PDF appears in the folder.

If a step fails, the message on the page names the missing setting. Netlify → **Logs → Functions** shows the server side. The database package needs Node 22 or newer; `netlify.toml` asks for it at build time, and if a function ever reports an unsupported Node version, set the environment variable `AWS_LAMBDA_JS_RUNTIME` to `nodejs22.x` and redeploy.

## Day-to-day

- **Update rates**: see "Changing rates" in `README.md`; commit and push, Netlify redeploys in about a minute.
- **Rotate the access key**: change `APP_ACCESS_KEY`, redeploy, tell the team. Browsers that hold the old key are asked again automatically.
- **Backups**: quotes are in the site's database and Blobs store; the PDF and JSON of each are also what you would restore from. Drive holds a human-readable copy of every PDF saved there.
- **Rollback**: Netlify → Deploys → pick an earlier deploy → *Publish deploy*.

## Not built yet

- **Automatic tier selection**: the tier is chosen by hand, as on the rate sheet. When the rule is decided (from metal weight, item type or similar) it is a small change in `src/app.js`.
- **Shared spot prices**: spot metal prices typed into the page are per browser. A shared store or a live feed (the JWY repo has an optional GoldAPI function) can be added.
- **Statistics page**: JWY ships a `quote-stats` function that nothing uses; not carried over.

## What was and was not tested

Tested here: all pricing, the PDF and GATI output, every button, the access-key flow, save/duplicate/search/reload against a real Postgres engine, email and Drive request shapes, and that the functions bundle with esbuild (Netlify's bundler) and fail with clear messages when a service is missing.

Not tested, because it needs your accounts: the live Netlify Database and Blobs, a real Resend send, and a real Google sign-in and upload. Step 6 above is that test.

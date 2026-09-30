// Builds the calculator into ONE self-contained HTML file (all CSS, JS and libraries inlined).
//   node tools/build.mjs             -> dist/index.html                 (deployed website; includes the web adapter)
//                                       and a copy at ./index.html       (so the repo itself contains the ready-to-open page)
//   node tools/build.mjs --artifact  -> build/phoenix-artifact.html     (for a Claude artifact; claude.ai supplies the adapter)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = process.argv.includes("--artifact");
const rd = p => readFileSync(join(root, p), "utf8");

const vendor = [
  "node_modules/jspdf/dist/jspdf.umd.min.js",
  "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
  "node_modules/xlsx/dist/xlsx.mini.min.js"
].map(p => rd(p));

// The logo is inlined as a data URI so the page stays one self-contained file.
const logo = "data:image/png;base64," + readFileSync(join(root, "assets/logo-white.png")).toString("base64");
const logos = `const LOGOS = { white: ${JSON.stringify(logo)} };`;

const app = [logos, ...["src/data.js", "src/engine.js", "src/export.js", ...(artifact ? [] : ["src/web-adapter.js"]), "src/app.js"].map(p => rd(p))];

// Inlined scripts must not contain a closing script tag.
for (const code of [...vendor, ...app]) if (/<\/script/i.test(code)) throw new Error("A source file contains </script>, which would break inlining.");

const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#9C4A63"/><text x="16" y="22.5" font-family="Georgia,serif" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">P</text></svg>');
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">';
const body = `${fonts}
<style>
${rd("src/style.css")}
</style>
<div id="app"></div>
${vendor.map(v => `<script>\n${v}\n</script>`).join("\n")}
<script>
${app.join("\n")}
</script>
`;

const html = artifact
  ? `<title>Phoenix Calculator</title>\n${body}`
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#241B1E">
<title>Phoenix Calculator</title>
<link rel="icon" href="${icon}">
</head>
<body>
${body}</body>
</html>
`;

const out = artifact ? join(root, "build", "phoenix-artifact.html") : join(root, "dist", "index.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out.replace(root + "/", ""), (html.length / 1024).toFixed(0) + " KB");
// A ready-to-open copy of the website build sits in the repo root, so the finished page is visible on GitHub
// (Netlify still builds its own from src/). It is rewritten by every `npm run build`; commit it with your changes.
if (!artifact) {
  writeFileSync(join(root, "phoenix-calculator.html"), html);
  console.log("phoenix-calculator.html", (html.length / 1024).toFixed(0) + " KB");
}
if (!artifact) { copyFileSync(out, join(root, "index.html")); console.log("index.html (copy at the repo root)"); }

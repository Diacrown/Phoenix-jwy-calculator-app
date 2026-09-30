// The repo carries a built copy of the page at ./index.html. If someone changes src/ and forgets to rebuild and commit it,
// this fails so the committed page never quietly goes stale.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const built = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
const committed = fs.existsSync(path.join(root, "index.html")) ? fs.readFileSync(path.join(root, "index.html"), "utf8") : null;
const ok = committed === built;
console.log((ok ? "PASS " : "FAIL ") + "./index.html matches a fresh build of src/" + (ok ? "" : "  (run `npm run build` and commit index.html)"));
process.exit(ok ? 0 : 1);

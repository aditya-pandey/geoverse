/* Make a cover image for a story video:  node thumbnail.mjs stories/pheasant-island.json  →  out/<id>.thumbnail.png
 * Uses the place's aerial photo from fetch_place.py. Text, flags and zoom can be set under "thumbnail" in the story JSON. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "../..");
const argv = process.argv.slice(2), spec = JSON.parse(fs.readFileSync(path.resolve(argv[0]), "utf8"));
const oi = argv.indexOf("--out"), OUT = path.resolve(oi >= 0 ? argv[oi + 1] : path.join(HERE, "out"));
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".geojson": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`http://127.0.0.1:${server.address().port}/tools/shorts/thumbnail.html`);
await page.evaluate((s) => window.make({ spec: s }), spec);
const file = path.join(OUT, `${spec.id}.thumbnail.png`);
await page.locator("#stage").screenshot({ path: file });
console.log("✓", file);
await browser.close(); server.close();

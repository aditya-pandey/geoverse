/* Bhoogol countdown videos: a narrated "top 5" with a satellite globe, notebook fact cards and captions.
 *
 *   python3 tools/shorts/narrate.py tools/shorts/countdowns/smallest-countries.json tools/shorts/out
 *   node tools/shorts/countdown.mjs tools/shorts/countdowns/smallest-countries.json
 *   node tools/shorts/countdown.mjs <script.json> --still 3,12,30     a few frames, no MP4
 *
 * Narration comes from narrate.py (Kokoro, free and open). This renders the picture in headless
 * Chromium (WebGL for the globe), then mixes the voice, a quiet music bed and the sound effects.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "../.."), FPS = 30;
const argv = process.argv.slice(2), scriptPath = path.resolve(argv[0]);
const opt = (k) => { const i = argv.indexOf("--" + k); return i < 0 ? null : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true; };
const OUT = path.resolve(opt("out") || path.join(HERE, "out")); fs.mkdirSync(OUT, { recursive: true });
const spec = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
const timingPath = path.join(OUT, `${spec.id}.timing.json`), voicePath = path.join(OUT, `${spec.id}.voice.wav`);
if (!fs.existsSync(timingPath)) { console.error(`Run narrate.py first: ${timingPath} is missing`); process.exit(1); }
const timing = JSON.parse(fs.readFileSync(timingPath, "utf8"));
const site = opt("site") || process.env.BHOOGOL_SITE || "bhoogol.netlify.app";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
/* On a Mac the real GPU draws the globe; on Linux servers (GitHub, cloud) WebGL falls back to software. */
const GL_ARGS = process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : ["--ignore-gpu-blocklist"];
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/tools/shorts/countdown.html`);
const { dur, sfx } = await page.evaluate((a) => window.setup(a), { spec, timing, site });
const stage = page.locator("#stage");

if (opt("still")) {
  for (const t of String(opt("still")).split(",").map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await stage.screenshot({ path: path.join(OUT, `${spec.id}@${t}.jpg`), type: "jpeg", quality: 85 });
  }
} else {
  const silent = path.join(OUT, `.${spec.id}.video.mp4`);
  const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", silent], { stdio: ["pipe", "ignore", "inherit"] });
  const n = Math.round(dur * FPS), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const buf = await stage.screenshot({ type: "jpeg", quality: 92 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i}/${n} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  enc.stdin.end(); await new Promise((r) => enc.on("close", r));
  /* sound: voice up front, the cinematic bed underneath (looped to length), effects on their moments */
  const A = (f) => path.join(HERE, "audio", f);
  /* music: bright and curious, and it ducks under the voice (sidechain) so every word stays clear */
  const inputs = ["-i", silent, "-i", voicePath, "-stream_loop", "-1", "-i", A(spec.music || "bed_bright.m4a")];
  const f = [`[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[v][vk]`,
    `[2:a]atrim=0:${dur},afade=t=in:d=0.6,afade=t=out:st=${(dur - 2).toFixed(2)}:d=2,volume=0.62[b0]`,
    `[b0][vk]sidechaincompress=threshold=0.025:ratio=4:attack=25:release=450[b]`];
  const labels = ["[v]", "[b]"];
  sfx.forEach((s, i) => { inputs.push("-i", A(`${s.name}.wav`)); const ms = Math.round(s.t * 1000);
    f.push(`[${i + 3}:a]adelay=${ms}|${ms},volume=${(s.gain * 0.7).toFixed(2)}[s${i}]`); labels.push(`[s${i}]`); });
  f.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=9[a]`);
  const file = path.join(OUT, `${spec.id}.mp4`);
  await new Promise((res, rej) => { const p = spawn("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", f.join(";"), "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", dur.toFixed(3), "-movflags", "+faststart", file], { stdio: "inherit" });
    p.on("close", (c) => (c ? rej(new Error("ffmpeg " + c)) : res())); });
  fs.unlinkSync(silent); console.log("✓", file, dur.toFixed(1), "s");
}
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close(); server.close();

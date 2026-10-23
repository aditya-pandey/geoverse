/* Bhoogol Shorts · render vertical quiz videos (1080×1920, 30 fps) with sound. No AI needed.
 *
 *   node tools/shorts/make.mjs                          next 7 days from today
 *   node tools/shorts/make.mjs --start 2026-10-26 --count 14
 *   node tools/shorts/make.mjs --date 2026-10-27        just one
 *   node tools/shorts/make.mjs --still 5.5              a single frame per episode (quick look)
 *   node tools/shorts/make.mjs --site bhoogol.in        use your own domain in the videos and captions
 *   node tools/shorts/make.mjs --stories                 also a cinematic country story for each Guess video
 *   node tools/shorts/make.mjs --story ISL,CHL --only-stories   just those stories
 *
 * Writes to tools/shorts/out/: one MP4 per day plus posts.md (titles, captions, hashtags).
 * Needs: node 20+, ffmpeg, and Playwright's Chromium (npx playwright install chromium).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FPS = 30;

/* ---------- args ---------- */
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) =>
  v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? true : all[i + 1]]] : a, []));
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India time
const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 864e5).toISOString().slice(0, 10);
const start = args.date || (args.start === "tomorrow" ? tomorrow : args.start) || today;
const count = args.date ? 1 : +(args.count || 7);
const OUT = path.resolve(args.out || path.join(HERE, "out"));
const JOBS = +(args.jobs || 2);
fs.mkdirSync(OUT, { recursive: true });
/* the address shown in every video and caption; pass --site bhoogol.in once you have a domain */
process.env.BHOOGOL_SITE = args.site || process.env.BHOOGOL_SITE || "bhoogol.netlify.app";
const { plan, storyEpisode } = await import("./episodes.mjs");

/* ---------- a tiny static server over the repo (the page reads data/ and brand/) ---------- */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".geojson": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${server.address().port}/tools/shorts/short.html`;

/* ---------- render ---------- */
const run = (cmd, argv, opts = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, argv, { stdio: ["pipe", "ignore", "pipe"], ...opts }); let err = "";
  p.stderr.on("data", (d) => (err += d)); p.on("close", (c) => (c ? rej(new Error(`${cmd} exited ${c}\n${err.slice(-2000)}`)) : res()));
  return p;
});

async function renderOne(browser, ep) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(URL_);
  const { dur, sfx } = await page.evaluate((e) => window.setup(e), { ...ep, site: process.env.BHOOGOL_SITE });
  const stage = page.locator("#stage");

  if (args.still) {
    const ts = String(args.still).split(",").map(Number);
    for (const t of ts) { await page.evaluate((t) => window.seek(t), t); await stage.screenshot({ path: path.join(OUT, `${ep.id}@${t}.jpg`), type: "jpeg", quality: 85 }); }
    await page.close(); return { ep, dur, errors };
  }

  const silent = path.join(OUT, `.${ep.id}.video.mp4`);
  const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", silent], { stdio: ["pipe", "ignore", "inherit"] });
  const frames = Math.round(dur * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const buf = await stage.screenshot({ type: "jpeg", quality: 92 });
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
  }
  enc.stdin.end(); await new Promise((r) => enc.on("close", r));
  await page.close();

  /* sound: the music bed (faded at the end) + each one-shot at its moment */
  const A = (n) => path.join(HERE, "audio", n);
  const bedFile = ep.format === "story" ? "bed_cine.m4a" : "bed.m4a", bedVol = ep.format === "story" ? 0.95 : 0.75;
  const inputs = ["-i", silent, "-i", A(bedFile)], filters = [`[1:a]atrim=0:${dur},afade=t=in:d=0.05,afade=t=out:st=${(dur - 1.4).toFixed(2)}:d=1.4,volume=${bedVol}[bed]`], labels = ["[bed]"];
  sfx.forEach((s, i) => {
    inputs.push("-i", A(`${s.name}.wav`));
    const ms = Math.max(0, Math.round(s.t * 1000));
    filters.push(`[${i + 2}:a]adelay=${ms}|${ms},volume=${s.gain}[s${i}]`); labels.push(`[s${i}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=9[a]`);
  const file = path.join(OUT, `${ep.id}.mp4`);
  await run("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", dur.toFixed(3), "-movflags", "+faststart", file]);
  fs.unlinkSync(silent);
  return { ep, dur, errors, file };
}

let episodes = plan(start, count);
/* --stories: a cinematic follow-up for each Guess video in the range · --story ISL,CHL: just those countries · --only-stories: skip the quizzes */
const stories = [];
if (args.stories) for (const ep of episodes) if (ep.format === "guess") stories.push(storyEpisode(ep.items[0].cca3, ep.date));
if (args.story) for (const c of String(args.story).split(",")) stories.push(storyEpisode(c.trim().toUpperCase()));
if (args["only-stories"]) episodes = [];
episodes = [...episodes, ...stories];
const browser = await chromium.launch();
const results = [];
const queue = [...episodes];
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  while (queue.length) {
    const ep = queue.shift();
    const r = await renderOne(browser, ep);
    results.push(r);
    console.log(`✓ ${ep.id} · ${r.dur.toFixed(1)} s${r.errors.length ? " · page errors: " + r.errors.join(" | ") : ""} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
}));
await browser.close(); server.close();

/* ---------- posts.md: what to paste with each video ---------- */
if (!args.still) {
  const md = ["# Bhoogol Shorts", "", `Made ${new Date().toISOString().slice(0, 10)} · ${results.length} videos · post one a day.`, "",
    "Post one a day at the same time (6pm IST works). Reply to comments in the first hour.", ""];
  results.sort((a, b) => (a.ep.format === "story") - (b.ep.format === "story") || String(a.ep.date).localeCompare(String(b.ep.date)));
  for (const { ep } of results) {
    if (ep.format === "story" && !md.includes("## Bonus")) md.push("## Bonus: country stories", "", "Cinematic follow-ups. Post each one a day or two after its Guess video, as an extra post.", "");
    const c = ep.caption;
    md.push(ep.format === "story" ? `### ${ep.items[0].name} · ${path.basename(ep.id)}.mp4${ep.date ? ` (after the ${ep.date} Guess)` : ""}` : `## ${ep.date} · ${path.basename(ep.id)}.mp4`, "", "**YouTube title**", "", c.title, "", "**YouTube description**", "", c.youtube, "",
      "**Instagram caption**", "", c.instagram, "", "**Pin this comment**", "", c.pin, "");
    if (ep.format === "guess" && ep.status !== "reviewed") md.push(`> Story status is *${ep.status}*. Worth a glance at the clues before posting.`, "");
  }
  fs.writeFileSync(path.join(OUT, "posts.md"), md.join("\n"));
  console.log(`\n${results.length} videos in ${OUT}`);
}

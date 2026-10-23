/* Bhoogol Shorts · what each day's video asks.
 *
 * Everything comes from the repo's own data, so no AI is needed to run it:
 *   · data/daily/*.json   World Bank figures the Daily already uses (forest, life, rain, pop, area, neighbours)
 *   · data/stories.json   the hand-written country stories (for "Guess the country")
 *   · world-countries     names, ISO codes, regions, demonyms, capitals
 *
 * It is deterministic: the same date always gives the same episode, so a re-run never
 * changes a video, and no state file is needed. It never repeats a Daily line-up.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const COUNTRIES = require("world-countries/countries.json");
const C = new Map(COUNTRIES.map((c) => [c.cca3, c]));

/* ---------- data ---------- */
function loadDaily() {
  const dir = path.join(ROOT, "data", "daily");
  const pool = {}, years = {}, combos = new Set();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const days = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).days;
    for (const v of Object.values(days)) for (const r of v.rounds) {
      pool[r.m] ??= {};
      for (const [cca3, val] of r.c) pool[r.m][cca3] = val;
      if (r.y) years[r.m] = Math.max(years[r.m] || 0, r.y);
      combos.add(comboKey(r.m, r.c.map((x) => x[0])));
    }
  }
  return { pool, years, combos };
}
const comboKey = (m, codes) => m + ":" + [...codes].sort().join(",");
const STORIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "stories.json"), "utf8"));
const { pool: POOL, years: YEARS, combos: DAILY_COMBOS } = loadDaily();

/* ---------- metrics ---------- */
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
function people(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/0$/, "")} billion`;
  if (n >= 1e6) return `${n >= 1e8 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1).replace(/\.0$/, "")} million`;
  return fmtInt(n);
}
export const METRICS = {
  forest: { q: "Which has the most forest?", ask: "more forest", short: "forest cover", fmt: (v) => `${v < 1 ? v.toFixed(1) : Math.round(v)}% forest`, src: "World Bank" },
  life: { q: "Where do people live longest?", ask: "longer lives", short: "life expectancy", fmt: (v) => `${v.toFixed(1).replace(/\.0$/, "")} years`, src: "World Bank" },
  rain: { q: "Which gets the most rain?", ask: "more rain", short: "rain a year", fmt: (v) => `${fmtInt(v)} mm a year`, src: "World Bank" },
  pop: { q: "Which has the most people?", ask: "more people", short: "population", fmt: people, src: "World Bank" },
  area: { q: "Which is the biggest?", ask: "is bigger", short: "area", fmt: (v) => `${fmtInt(v)} km²`, src: "World Bank" },
  neighbours: { q: "Which has the most neighbours?", ask: "more neighbours", short: "land neighbours", fmt: (v) => `${v} ${v === 1 ? "neighbour" : "neighbours"}`, src: "Natural Earth" },
};
const RANK_METRICS = ["forest", "life", "rain", "pop", "area", "neighbours"];

/* ---------- deterministic randomness ---------- */
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- helpers ---------- */
function country(cca3, value, metric) {
  const c = C.get(cca3);
  if (!c) return null;
  return {
    cca3, cca2: c.cca2.toLowerCase(), ccn3: c.ccn3, name: c.name.common, latlng: c.latlng,
    ...(metric ? { value, label: METRICS[metric].fmt(value) } : {}),
  };
}
const areaOf = (cca3) => POOL.area?.[cca3] ?? C.get(cca3)?.area ?? 0;
const regionOf = (cca3) => C.get(cca3)?.subregion || C.get(cca3)?.region || "";

/* Kendall-ish surprise: how many pairs does "bigger country = more" get wrong? */
function surprise(codes, metric) {
  let wrong = 0, n = 0;
  for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
    const a = codes[i], b = codes[j];
    n++; if (Math.sign(areaOf(a) - areaOf(b)) !== Math.sign(POOL[metric][a] - POOL[metric][b])) wrong++;
  }
  return n ? wrong / n : 0;
}

/* ---------- formats ---------- */
/* topics rotate in a fixed order so a week never repeats one (the pick still uses r, keeping the rest stable) */
const RANK_ORDER = ["area", "rain", "life", "forest", "pop", "neighbours"];
const TT_ORDER = ["rain", "pop", "area", "neighbours", "forest", "pop"];
function rankEpisode(r, k, attempt = 0) {
  pick(r, RANK_METRICS); const metric = RANK_ORDER[k % RANK_ORDER.length];
  const table = POOL[metric], codes = Object.keys(table).filter((k) => C.has(k));
  for (let tries = 0; tries < 400; tries++) {
    const four = shuffle(r, codes).slice(0, 4);
    const vals = four.map((k) => table[k]);
    const sorted = [...vals].sort((a, b) => b - a), range = sorted[0] - sorted[3];
    if (!range) continue;
    const gaps = sorted.slice(1).map((v, i) => sorted[i] - v);
    if (Math.min(...gaps) < range * 0.08) continue;                 // every step readable
    if (new Set(four.map(regionOf)).size < 3) continue;             // spread around the world
    if (DAILY_COMBOS.has(comboKey(metric, four))) continue;         // never spoil a Daily
    if (metric !== "area" && surprise(four, metric) < 0.33) continue; // at least one twist
    const items = four.map((k) => country(k, table[k], metric));
    const order = [...items.keys()].sort((a, b) => items[b].value - items[a].value);
    if (order.every((v, i) => v === i)) continue;                   // don't show it pre-sorted
    return { format: "rank", metric, q: METRICS[metric].q, year: YEARS[metric] || null, items, order };
  }
  return attempt < 3 ? rankEpisode(r, k, attempt + 1) : null;
}

function thisThatEpisode(r, k) {
  /* the classic trap: the bigger country on the map isn't the one with more */
  pick(r, TT_ORDER); const metric = TT_ORDER[k % TT_ORDER.length];
  const table = POOL[metric], codes = Object.keys(table).filter((k) => C.has(k));
  for (let tries = 0; tries < 600; tries++) {
    const [a, b] = shuffle(r, codes);
    const va = table[a], vb = table[b];
    if (!va || !vb || Math.abs(va - vb) / Math.max(va, vb) < 0.18) continue; // clear winner
    const winner = va > vb ? a : b, loser = winner === a ? b : a;
    let twist;
    if (metric === "area") twist = (POOL.pop[loser] ?? 0) < (POOL.pop[winner] ?? 0) ? false : true;
    else twist = areaOf(winner) < areaOf(loser);                       // smaller country wins
    if (!twist) continue;
    if (metric === "area" && areaOf(winner) / areaOf(loser) > 3) continue;
    if (regionOf(a) === regionOf(b) && r() < 0.6) continue;
    return {
      format: "thisthat", metric, q: `Which has ${METRICS[metric].ask}?`.replace("Which has is bigger?", "Which is bigger?"),
      year: YEARS[metric] || null, items: [country(a, va, metric), country(b, vb, metric)], winner: winner === a ? 0 : 1,
    };
  }
  return null;
}

/* sentences that don't give the country away (or lean on India-only comparisons) */
const INDIA_WORDS = /\b(India|Indian|lakh|crore|Kashmir|Kanyakumari|Mumbai|Pune|Delhi|Chandigarh|Jaipur|Kerala|Goa|Maharashtra|Gujarat|Rajasthan|Bengaluru|Chennai|Kolkata|Hyderabad|Punjab|Assam|Sikkim|Ladakh)\b/i;
function giveaways(c) {
  const w = [c.name.common, c.name.official, ...(c.altSpellings || []), ...(c.capital || [])];
  const d = c.demonyms?.eng; if (d) w.push(d.m, d.f);
  if (c.cca3 === "IRL") w.push("Irish"); if (c.cca3 === "GBR") w.push("British", "England", "Scotland");
  return w.filter((x) => x && x.length > 2).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
/* "36 lakh" → "3.6 million", "146 crore" → "1.46 billion": the stories are written for India, the videos are for everyone */
export function international(text) {
  const fmt = (n) => n >= 1e9 ? `${+(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)} million` : Math.round(n).toLocaleString("en-US");
  return String(text || "").replace(/(\d+(?:\.\d+)?)\s*(lakh|crore)\b/gi, (_, n, u) => fmt(parseFloat(n) * (u.toLowerCase() === "lakh" ? 1e5 : 1e7)));
}
function sentences(text) { /* split on sentence ends, never inside a number like 3.6 or 2.5 */ return (international(text).replace(/(\d)\.(\d)/g, "$1\u2024$2").match(/[^.!?]+[.!?]+/g)?.map((x) => x.trim().replace(/\u2024/g, ".")) || []); }
export function clueSentences(cca3) {
  const c = C.get(cca3), s = STORIES[cca3]; if (!c || !s) return [];
  const bad = new RegExp(`\\b(${giveaways(c).join("|")})`, "i");
  const out = [];
  /* a field's first sentence stands on its own; later ones often lean on it ("it", "why", "those") */
  for (const field of ["surprise", "land", "people"]) sentences(s[field]).forEach((t, i) => {
    const clean = t.replace(/\s+/g, " ");
    if (clean.length < 18 || clean.length > 120) return;
    if (bad.test(clean) || /\b(lakh|crore)\b/i.test(clean) || (cca3 !== "IND" && INDIA_WORDS.test(clean))) return;
    const leans = /^(But|And|So|Then|That|This|These|Those|It|Its|They|Their|Them|He|She|Here|Which|Both)\b/.test(clean) || /\b(why|that's why|this is|those|it's called|which is why)\b/i.test(clean);
    if (i > 0 && leans) return;
    if (i === 0 && /^(It|Its|They|Their|This|These)\b/.test(clean)) return;
    out.push({ field, text: clean, first: i === 0 });
  });
  return out.sort((a, b) => b.first - a.first);
}
const SUBREGION = { "Southern Asia": "South Asia", "South-Eastern Asia": "Southeast Asia", "Eastern Asia": "East Asia", "Western Asia": "West Asia", "Northern Europe": "northern Europe", "Southern Europe": "southern Europe", "Western Europe": "western Europe", "Eastern Europe": "eastern Europe", "Central Europe": "central Europe", "Northern Africa": "North Africa", "Eastern Africa": "East Africa", "Western Africa": "West Africa", "Southern Africa": "southern Africa", "Middle Africa": "central Africa", "South America": "South America", "North America": "North America", "Central America": "Central America", "Caribbean": "the Caribbean", "Australia and New Zealand": "Oceania", "Melanesia": "the Pacific", "Polynesia": "the Pacific", "Micronesia": "the Pacific", "Central Asia": "Central Asia" };
function guessEpisode(r, n) {
  /* walk the stories in a fixed shuffled order: reviewed ones first */
  const codes = Object.keys(STORIES).filter((k) => k !== "_about" && C.has(k));
  const reviewed = shuffle(rng(7), codes.filter((k) => STORIES[k].status === "reviewed"));
  const rest = shuffle(rng(11), codes.filter((k) => STORIES[k].status !== "reviewed"));
  const order = [...reviewed, ...rest];
  const usable = order.filter((k) => STORIES[k].hook && clueSentences(k).length);
  {
    const cca3 = usable[n % usable.length], s = STORIES[cca3], c = C.get(cca3);
    const pool = clueSentences(cca3);
    const pref = pool[0];
    const sub = SUBREGION[c.subregion] || c.subregion || c.region;
    return {
      format: "guess", q: "Guess the country", items: [country(cca3)], status: s.status,
      clues: [s.hook, pref.text, `It's in ${sub}.`],
    };
  }
  return null;
}

/* ---------- cinematic: a country's story (a follow-up to its Guess video) ---------- */
function storyFacts(cca3) {
  const st = STORIES[cca3], out = [];
  const labels = { land: "The land", people: "The people", surprise: "The surprise" };
  for (const field of ["land", "people", "surprise"]) {
    const ss = sentences(st[field]).map((x) => x.replace(/\s+/g, " "));
    const ok = (x) => x.length >= 18 && x.length <= 150 && !/\b(lakh|crore)\b/i.test(x) && (cca3 === "IND" || !INDIA_WORDS.test(x));
    let i = ss.findIndex(ok);
    if (i < 0) continue;
    let text = ss[i];
    const fine = (x) => !/\b(lakh|crore)\b/i.test(x) && (cca3 === "IND" || !INDIA_WORDS.test(x));
    for (let j = i + 1; j < ss.length && text.length < 80 && fine(ss[j]) && (text + " " + ss[j]).length <= 150; j++) text += " " + ss[j];
    out.push({ label: labels[field], text });
  }
  return out;
}
export function storyEpisode(cca3, after) {
  const c = C.get(cca3), st = STORIES[cca3];
  if (!c || !st) throw new Error(`no story for ${cca3}`);
  const name = c.name.common, link = process.env.BHOOGOL_SITE || "bhoogol.netlify.app";
  const region = SUBREGION[c.subregion] || c.subregion || c.region;
  const tags = ["#geography", "#travel", "#maps", `#${name.toLowerCase().replace(/[^a-z]/g, "")}`, "#bhoogol"];
  return {
    id: `bhoogol-story-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, format: "story", date: after || null,
    q: st.hook, items: [country(cca3)], region, facts: storyFacts(cca3), status: st.status, total: Object.keys(STORIES).filter((k) => k !== "_about").length,
    caption: {
      title: `${st.hook.replace(/\.$/, "")}. The story of ${name} 🌍`.slice(0, 100),
      youtube: `${name} in 20 seconds. Which country should we do next?\n\nExplore 80 country stories at ${link} (link on the channel page).\n\n${[...tags, "#shorts"].join(" ")}`,
      instagram: `${st.hook} 🌍\n\n${name} in 20 seconds. Save this for your next trivia night, and tell me which country we should do next 👇\n\nExplore 80 country stories, link in bio.\n\n${tags.join(" ")}`,
      pin: "Which country should we tell next?",
    },
  };
}

/* ---------- the schedule ---------- */
const EPOCH = Date.UTC(2026, 9, 22); // Thu 22 Oct 2026 = day 0 (Fri 23 Oct, Mongolia, was the first post)
const FORMATS = ["rank", "guess", "thisthat"];
export function episodeFor(dateStr) {
  const d = Math.round((Date.parse(dateStr + "T00:00:00Z") - EPOCH) / 864e5);
  const fmt = FORMATS[((d % 3) + 3) % 3];
  const r = rng(hash("bhoogol-shorts:" + dateStr));
  const k = Math.floor(d / 3);
  const ep = fmt === "rank" ? rankEpisode(r, k) : fmt === "thisthat" ? thisThatEpisode(r, k) : guessEpisode(r, k);
  if (!ep) throw new Error(`no episode for ${dateStr}`);
  return { id: `bhoogol-${dateStr}-${ep.format}`, date: dateStr, n: d, ...ep, caption: caption(ep) };
}
export function plan(start, count) {
  const t0 = Date.parse(start + "T00:00:00Z");
  return Array.from({ length: count }, (_, i) => episodeFor(new Date(t0 + i * 864e5).toISOString().slice(0, 10)));
}

/* ---------- post text (titles, captions, hashtags) ---------- */
function caption(ep) {
  /* what to paste: a YouTube title + description, an Instagram caption, and a comment to pin.
     Captions open with the video's own hook and never give the answer away. */
  const link = process.env.BHOOGOL_SITE || "bhoogol.netlify.app";
  const ytEnd = `A new geography quiz every day. Play today's puzzle at ${link} (link on the channel page).`;
  const igEnd = "A new geography quiz every day. Play today's puzzle, link in bio.";
  const base = ["#geography", "#geographyquiz", "#maps"];
  if (ep.format === "rank") {
    const names = ep.items.map((i) => i.name), list = `${names.slice(0, 3).join(", ")} or ${names[3]}`;
    const topic = { area: "#countries", rain: "#weather", life: "#lifeexpectancy", forest: "#forests", pop: "#population", neighbours: "#borders" }[ep.metric];
    const tags = [...base, topic, "#bhoogol"];
    return {
      title: `${ep.q} ${list} 🌍`.slice(0, 100),
      youtube: `Rank them before the reveal. How many did you get right?\n\n${ytEnd}\n\n${[...tags, "#shorts"].join(" ")}`,
      instagram: `${ep.q} 🤔\n\n${list}. Rank them before the reveal, then tell me how many you got right 👇\n\n${igEnd}\n\n${tags.join(" ")}`,
      pin: "How many did you get in the right order? 0, 1, 2 or all 4?",
    };
  }
  if (ep.format === "thisthat") {
    const [a, b] = ep.items.map((i) => i.name), tags = [...base, "#thisorthat", "#bhoogol"];
    return {
      title: `${a} or ${b}? ${ep.q} 🌍`,
      youtube: `Make your pick before the reveal.\n\n${ytEnd}\n\n${[...tags, "#shorts"].join(" ")}`,
      instagram: `${a} or ${b}? ${ep.q} 🤔\n\nPick one before the reveal 👇\n\n${igEnd}\n\n${tags.join(" ")}`,
      pin: `Team ${a} or team ${b}? Were you right?`,
    };
  }
  const hook = ep.clues[0], tags = [...base, "#guessthecountry", "#bhoogol"];
  return {
    title: `${hook.replace(/\.$/, "")}. Which country is it? 🌍`.slice(0, 100),
    youtube: `Three clues, one country. Did you get it on clue 1, 2 or 3?\n\n${ytEnd}\n\n${[...tags, "#shorts"].join(" ")}`,
    instagram: `${hook} 🌍\n\nThree clues, one country. Can you name it before the reveal?\n\nTell me which clue gave it away 👇\n\n${igEnd}\n\n${tags.join(" ")}`,
    pin: "Did you get it on clue 1, 2 or 3? Be honest 😄",
  };
}

/* node episodes.mjs 2026-10-26 14  → prints the plan */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [start = new Date().toISOString().slice(0, 10), count = "7"] = process.argv.slice(2);
  for (const ep of plan(start, +count)) {
    const what = ep.format === "guess" ? `${ep.items[0].name} (${ep.status}) · ${ep.clues.join(" | ")}`
      : ep.items.map((i) => `${i.name} ${i.label}`).join(" · ");
    console.log(`${ep.date} ${ep.format.padEnd(8)} ${ep.q}  →  ${what}`);
  }
}

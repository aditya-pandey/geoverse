#!/usr/bin/env node
/* Daily Bhoogol · Line-up puzzle generator
 *
 *   node tools/build_daily.mjs            build missing days (two years ahead)
 *   node tools/build_daily.mjs --refresh  re-download the source data first
 *
 * Every day = three Line-ups (a fact, a quirky one, a serious one), five countries each.
 * Days that already exist are never rewritten: a puzzle, once published, stays the same
 * for everyone, even if the data is corrected later.
 *
 * Rules each day obeys:
 *   · neighbouring values differ by ≥ 8 % (and ≥ 3 points for percentages): no coin-flips
 *   · a country doesn't return within 5 days, a measure within 6 days
 *   · the same five countries never meet twice
 *   · each Line-up spans ≥ 3 continents, and isn't simply "biggest population first"
 *   · difficulty climbs through the week: well-known countries Monday, anyone Saturday
 *   · themed days (Children's Day, Earth Day, …) pick a measure that fits
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tools", "daily-source.json");
const OUT = path.join(ROOT, "data", "daily");
export const EPOCH = "2026-10-18"; // Bhoogol #1
const DAYS = 730;
const DELHI = [28.61, 77.21];

// id → where the number comes from. Keep in step with DAILY_MEASURES in app.js.
const MEASURES = {
  // facts
  pop:        { kind: "fact", wb: "SP.POP.TOTL" },
  area:       { kind: "fact", wb: "AG.SRF.TOTL.K2" },
  density:    { kind: "fact", wb: "EN.POP.DNST" },
  urban:      { kind: "fact", wb: "SP.URB.TOTL.IN.ZS", pct: true },
  neighbours: { kind: "fact", calc: (c) => (c.borders || []).length, int: true },
  equator:    { kind: "fact", calc: (c) => Math.round(Math.abs(c.latlng[0])), int: true },
  delhi:      { kind: "fact", calc: (c) => Math.round(km(DELHI, c.latlng) / 10) * 10, skip: ["IND"] },
  // quirky
  kids:       { kind: "quirky", wb: "SP.POP.0014.TO.ZS", pct: true },
  grandparents: { kind: "quirky", wb: "SP.POP.65UP.TO.ZS", pct: true },
  phones:     { kind: "quirky", wb: "IT.CEL.SETS.P2" },
  rain:       { kind: "quirky", wb: "AG.LND.PRCP.MM" },
  farmland:   { kind: "quirky", wb: "AG.LND.ARBL.ZS", pct: true },
  water:      { kind: "quirky", wb: "ER.H2O.INTR.PC" },
  grain:      { kind: "quirky", wb: "AG.PRD.CREL.MT", perPerson: 1000 }, // kg of cereal grown per person
  // serious
  life:       { kind: "serious", wb: "SP.DYN.LE00.IN" },
  forest:     { kind: "serious", wb: "AG.LND.FRST.ZS", pct: true },
  co2:        { kind: "serious", wb: "EN.GHG.CO2.PC.CE.AR5" },
  renew:      { kind: "serious", wb: "EG.FEC.RNEW.ZS", pct: true },
  internet:   { kind: "serious", wb: "IT.NET.USER.ZS", pct: true },
  women:      { kind: "serious", wb: "SG.GEN.PARL.ZS", pct: true },
  income:     { kind: "serious", wb: "NY.GDP.PCAP.CD" },
  health:     { kind: "serious", wb: "SH.XPD.CHEX.PC.CD" },
};
const KINDS = ["fact", "quirky", "serious"];

// month-day → [measure, theme line shown above the game]
const THEMES = {
  "03-08": ["women", "International Women's Day"],
  "03-21": ["forest", "International Day of Forests"],
  "03-22": ["water", "World Water Day"],
  "04-07": ["life", "World Health Day"],
  "04-22": ["co2", "Earth Day"],
  "05-17": ["internet", "World Telecommunication Day"],
  "06-05": ["renew", "World Environment Day"],
  "07-11": ["pop", "World Population Day"],
  "10-01": ["grandparents", "International Day of Older Persons"],
  "10-16": ["grain", "World Food Day"],
  "11-14": ["kids", "Children's Day"],
};

function km([la1, lo1], [la2, lo2]) {
  const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sig3 = (v) => (v === 0 ? 0 : +v.toPrecision(3));

async function getJSON(url) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(url, { headers: { "User-Agent": "BhoogolBuild/1.0" } }); if (r.ok) return r.json(); } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
  throw new Error("fetch failed: " + url);
}

async function loadSource(refresh) {
  if (!refresh && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const raw = await getJSON("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json");
  const countries = raw.filter((c) => c.unMember && c.latlng?.length === 2)
    .map((c) => ({ cca3: c.cca3, name: c.name.common, region: c.region, latlng: c.latlng, borders: c.borders || [] }));
  const wb = {};
  for (const [id, m] of Object.entries(MEASURES)) {
    if (!m.wb) continue;
    const j = await getJSON(`https://api.worldbank.org/v2/country/all/indicator/${m.wb}?format=json&mrnev=1&per_page=400`);
    wb[id] = Object.fromEntries((j[1] || []).filter((r) => r.value != null).map((r) => [r.countryiso3code, [r.value, +r.date]]));
    process.stdout.write(`  ${id.padEnd(13)} ${Object.keys(wb[id]).length} countries\n`);
  }
  const gdp = await getJSON("https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=400");
  const src = { fetched: new Date().toISOString().slice(0, 10), countries, wb, gdp: Object.fromEntries((gdp[1] || []).filter((r) => r.value != null).map((r) => [r.countryiso3code, r.value])) };
  fs.writeFileSync(CACHE, JSON.stringify(src));
  return src;
}

// measure → { cca3: value } plus the data year (most common one across the countries kept)
function buildTables(src) {
  const pop = src.wb.pop;
  const T = {};
  for (const [id, m] of Object.entries(MEASURES)) {
    const vals = {}, years = {};
    for (const c of src.countries) {
      if (m.skip?.includes(c.cca3)) continue;
      let v, y;
      if (m.calc) v = m.calc(c);
      else {
        const e = src.wb[id]?.[c.cca3];
        if (!e || e[1] < 2015) continue;
        [v, y] = e;
        if (m.perPerson) { const p = pop[c.cca3]?.[0]; if (!p) continue; v = (v * m.perPerson) / p; }
      }
      if (v == null || !isFinite(v) || v < 0) continue;
      vals[c.cca3] = m.int ? v : sig3(v);
      if (y) years[y] = (years[y] || 0) + 1;
    }
    const year = Object.entries(years).sort((a, b) => b[1] - a[1])[0]?.[0];
    // a value much older than the rest isn't comparable (e.g. a parliament that no longer sits)
    if (year && !m.calc) for (const k of Object.keys(vals)) if (src.wb[id][k][1] < +year - 2) delete vals[k];
    T[id] = { vals, year: year ? +year : null };
  }
  return T;
}

// well-known first: by the better of population rank and economy rank
function fameOrder(src) {
  const rank = (obj) => {
    const ids = src.countries.map((c) => c.cca3).filter((k) => obj[k] != null).sort((a, b) => obj[b] - obj[a]);
    return Object.fromEntries(ids.map((k, i) => [k, i]));
  };
  const pr = rank(Object.fromEntries(Object.entries(src.wb.pop).map(([k, v]) => [k, v[0]]))), gr = rank(src.gdp);
  const score = (k) => 0.7 * (gr[k] ?? 999) + 0.3 * (pr[k] ?? 999); // the size of an economy tracks how often a country is in the news
  return src.countries.map((c) => c.cca3).filter((k) => (src.wb.pop[k]?.[0] || 0) >= 3e5).sort((a, b) => score(a) - score(b));
}
// Mon … Sun: how deep into the fame list a day may reach
const DEPTH = [100, 50, 65, 80, 100, 130, 999]; // Sunday (0) sits mid-week

function fairSpread(id, sortedVals) {
  const m = MEASURES[id];
  for (let i = 0; i + 1 < sortedVals.length; i++) {
    const a = sortedVals[i], b = sortedVals[i + 1];
    if (m.int ? a - b < 1 : (b <= 0 ? a <= 0 : a / b < 1.08)) return false;
    if (m.pct && a - b < 3) return false;
  }
  return true;
}

function main() {
  return (async () => {
    const src = await loadSource(process.argv.includes("--refresh"));
    const T = buildTables(src);
    const region = Object.fromEntries(src.countries.map((c) => [c.cca3, c.region]));
    const fame = fameOrder(src);
    const popOf = (k) => src.wb.pop[k]?.[0] || 0;
    fs.mkdirSync(OUT, { recursive: true });

    // what's already published: recency windows and "never the same five" start from it
    const months = new Map(); // "YYYY-MM" → { days: { date: entry } }
    for (const f of fs.readdirSync(OUT).filter((f) => /^\d{4}-\d{2}\.json$/.test(f))) months.set(f.slice(0, 7), JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")));
    const usedSets = new Set(), history = []; // history[i] = { countries:Set, measures:Set }
    const epoch = new Date(EPOCH + "T00:00:00Z");
    let made = 0;

    for (let n = 1; n <= DAYS; n++) {
      const d = new Date(epoch.getTime() + (n - 1) * 864e5);
      const date = d.toISOString().slice(0, 10), mon = date.slice(0, 7);
      if (!months.has(mon)) months.set(mon, { days: {} });
      const book = months.get(mon).days;
      const recentC = new Set(history.slice(-5).flatMap((h) => [...h.countries]));
      const recentM = new Set(history.slice(-6).flatMap((h) => [...h.measures]));

      if (book[date]) { // published: keep it exactly as it is
        const e = book[date];
        e.rounds.forEach((r) => usedSets.add(r.c.map((x) => x[0]).sort().join()));
        history.push({ countries: new Set(e.rounds.flatMap((r) => r.c.map((x) => x[0]))), measures: new Set(e.rounds.map((r) => r.m)) });
        continue;
      }

      const rng = mulberry32(0xb400 + n * 7919);
      const theme = THEMES[date.slice(5)];
      const pool = fame.slice(0, DEPTH[d.getUTCDay()]);
      const today = { countries: new Set(), measures: new Set() };
      const rounds = [];

      for (const kind of KINDS) {
        let ids = Object.keys(MEASURES).filter((id) => MEASURES[id].kind === kind);
        if (theme && MEASURES[theme[0]].kind === kind) ids = [theme[0]];
        else ids = shuffle(rng, ids.filter((id) => !recentM.has(id))).concat(shuffle(rng, ids.filter((id) => recentM.has(id))));
        let pick = null;
        for (const strict of [true, false]) {
          for (const id of ids) {
            const vals = T[id].vals;
            const cands = pool.filter((k) => vals[k] != null && !today.countries.has(k) && (!strict || !recentC.has(k)));
            if (cands.length < 12) continue;
            for (let tries = 0; tries < 400 && !pick; tries++) {
              // build the five one at a time, keeping only countries that stay fairly apart
              const five = [];
              for (const k of shuffle(rng, cands)) {
                if (five.length === 5) break;
                if (fairSpread(id, [...five, k].map((x) => vals[x]).sort((a, b) => b - a))) five.push(k);
              }
              if (five.length < 5) continue;
              if (new Set(five.map((k) => region[k])).size < 3) continue;
              const key = five.slice().sort().join();
              if (usedSets.has(key)) continue;
              const sorted = five.slice().sort((a, b) => vals[b] - vals[a]);
              if (!fairSpread(id, sorted.map((k) => vals[k]))) continue;
              if (id !== "pop" && sorted.join() === five.slice().sort((a, b) => popOf(b) - popOf(a)).join()) continue; // not just "most people first"
              // shown order: never already right, never simply reversed
              let shown;
              for (let s = 0; s < 20; s++) { shown = shuffle(rng, five); if (shown.join() !== sorted.join() && shown.join() !== sorted.slice().reverse().join()) break; }
              pick = { m: id, ...(T[id].year ? { y: T[id].year } : {}), c: shown.map((k) => [k, vals[k]]) };
              usedSets.add(key);
            }
            if (pick) break;
          }
          if (pick) break;
        }
        if (!pick) throw new Error(`no fair ${kind} Line-up for ${date}`);
        pick.c.forEach(([k]) => today.countries.add(k));
        today.measures.add(pick.m);
        rounds.push(pick);
      }
      book[date] = { n, ...(theme ? { theme: theme[1] } : {}), rounds };
      history.push(today);
      made++;
    }

    for (const [mon, file] of months) {
      const days = Object.fromEntries(Object.entries(file.days).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(path.join(OUT, mon + ".json"), JSON.stringify({ days }) + "\n");
    }
    console.log(`✓ ${made} new days · ${DAYS} total · data from ${src.fetched} · ${months.size} month files in data/daily/`);
  })();
}

main().catch((e) => { console.error(e); process.exit(1); });

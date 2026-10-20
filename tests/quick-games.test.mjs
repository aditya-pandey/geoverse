// The four quick games: five fair rounds, the right answer always on offer, same seed → same game
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, load } from "./extract.mjs";

const srcFile = path.join(ROOT, "tools/daily-source.json");
const src = fs.existsSync(srcFile) ? JSON.parse(fs.readFileSync(srcFile, "utf8")) : null;
const stories = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stories.json"), "utf8"));

function setup() {
  const feats = src.countries.map((c) => ({ gv: { cca3: c.cca3, cca2: c.cca3.slice(0, 2), name: { common: c.name }, region: c.region, latlng: c.latlng, borders: c.borders,
    population: src.wb.pop[c.cca3]?.[0] || 0, area: src.wb.area[c.cca3]?.[0] || 0, landlocked: false } }));
  const byCca3 = new Map(feats.map((f) => [f.gv.cca3, f]));
  const S = { byCca3, stories };
  const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }), fmtFull = new Intl.NumberFormat("en");
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const g = load(["mulberry32", "shuffleWith", "haversine", "QUICK", "QUICK_ROUNDS", "DELHI_LL", "llOf", "flagName", "REGION_IN", "TWO_CONTINENTS", "THIS_OR_THAT", "ODD_ONE", "makeQuickRounds"], {
    S, esc, fmt, fmtFull, nameOf: (d) => d?.gv?.name?.common, flagEmoji: () => "", centroidOf: (f) => ({ lat: f.gv.latlng[0], lng: f.gv.latlng[1] }),
    uniqueCountries: () => feats, storyOf: (d) => (d && stories[d.gv.cca3]?.hook ? stories[d.gv.cca3] : null),
  });
  const pool = feats.filter((f) => f.gv.population >= 8e6 && f.gv.latlng?.length === 2);
  return { ...g, pool };
}

test("every quick game makes five rounds, with the right answer among the options", { skip: !src && "needs tools/daily-source.json" }, () => {
  const g = setup();
  for (const mode of ["thisorthat", "oddone", "truefalse", "pickglobe"]) {
    for (const seed of [1, 7, 42, 99, 1234]) {
      const rounds = g.makeQuickRounds(mode, g.pool, g.mulberry32(seed));
      assert.equal(rounds.length, 5, `${mode} seed ${seed}`);
      assert.equal(new Set(rounds.map((r) => r.target.gv.cca3)).size, 5, `${mode}: a country repeats`);
      for (const r of rounds) {
        if (mode === "pickglobe") { assert.equal(r.cands.length, 4); assert.ok(r.cands.includes(r.target)); assert.equal(new Set(r.cands).size, 4); }
        else { assert.ok(r.options.includes(r.correct), `${mode}: ${r.text}`); assert.equal(new Set(r.options).size, r.options.length); }
      }
    }
  }
});
test("This or That: the answer is right, and never a near-tie", { skip: !src && "needs tools/daily-source.json" }, () => {
  const g = setup();
  for (let seed = 1; seed <= 30; seed++) for (const r of g.makeQuickRounds("thisorthat", g.pool, g.mulberry32(seed))) {
    const m = g.THIS_OR_THAT.find((x) => x.q === r.html);
    const [a, b] = r.frame, w = r.target, l = a === w ? b : a;
    assert.ok(m.v(w) >= m.v(l), r.text);
    assert.ok(m.ok(m.v(w), m.v(l)), `too close: ${r.text}`);
  }
});
test("True or false: True only when the hook really is that country's", { skip: !src && "needs tools/daily-source.json" }, () => {
  const g = setup();
  for (let seed = 1; seed <= 20; seed++) for (const r of g.makeQuickRounds("truefalse", g.pool, g.mulberry32(seed))) {
    assert.equal(r.correct === "True", r.frame[0] === r.target, r.text);
  }
});
test("the same seed gives the same game (challenge links)", { skip: !src && "needs tools/daily-source.json" }, () => {
  const g = setup();
  for (const mode of ["thisorthat", "oddone", "truefalse", "pickglobe"]) {
    const a = g.makeQuickRounds(mode, g.pool, g.mulberry32(5)).map((r) => r.text).join("|");
    const b = g.makeQuickRounds(mode, g.pool, g.mulberry32(5)).map((r) => r.text).join("|");
    assert.equal(a, b, mode);
  }
});

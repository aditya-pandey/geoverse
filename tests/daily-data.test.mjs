// The published puzzles obey their rules (checks data/daily/*.json as shipped)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, load } from "./extract.mjs";

const dir = path.join(ROOT, "data/daily");
const days = fs.readdirSync(dir).sort().flatMap((f) => Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).days));
const PCT = new Set(["urban", "kids", "grandparents", "farmland", "forest", "renew", "internet", "women"]);
const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }), fmtFull = new Intl.NumberFormat("en");
const { DAILY_MEASURES } = load(["one", "kmText", "DAILY_MEASURES"], { fmt, fmtFull });

test("numbered day by day from #1: three Line-ups of five at first, then one Line-up of four", () => {
  days.forEach(([d, e], i) => {
    assert.equal(e.n, i + 1);
    if (d < "2026-10-20") { assert.equal(e.rounds.length, 3); e.rounds.forEach((r) => assert.equal(r.c.length, 5)); }
    else { assert.equal(e.v, 2, d); assert.equal(e.rounds.length, 1, d); assert.equal(e.rounds[0].c.length, 4, d); }
  });
  assert.ok(days.length >= 365);
});
test("the light days only use measures anyone can reason about, with clear gaps", () => {
  const OK = new Set(["pop", "area", "delhi", "equator", "rain", "neighbours", "forest", "life"]);
  for (const [d, e] of days) {
    if (e.v !== 2) continue;
    const r = e.rounds[0];
    assert.ok(OK.has(r.m), `${d}: ${r.m}`);
    const v = r.c.map((x) => x[1]).sort((a, b) => b - a);
    for (let j = 0; j < 3; j++) {
      if (r.m === "life") assert.ok(v[j] - v[j + 1] >= 4.99, `${d} life gap`);
      else if (r.m === "equator") assert.ok(v[j] - v[j + 1] >= 6, `${d} equator gap`);
      else if (r.m === "neighbours") assert.ok(v[j] - v[j + 1] >= 2, `${d} neighbours gap`);
      else assert.ok(v[j + 1] <= 0 ? v[j] > 0 : v[j] / v[j + 1] >= 1.249, `${d} ${r.m} ${v[j]} vs ${v[j + 1]}`);
    }
  }
});
test("no ties, and neighbours are clearly apart", () => {
  for (const [d, e] of days) for (const r of e.rounds) {
    const v = r.c.map((x) => x[1]).sort((a, b) => b - a);
    for (let j = 0; j < v.length - 1; j++) {
      assert.notEqual(v[j], v[j + 1], `${d} ${r.m}`);
      if (!Number.isInteger(v[j]) && e.v !== 2) assert.ok(v[j] / v[j + 1] >= 1.079, `${d} ${r.m} ${v[j]} vs ${v[j + 1]}`);
      if (PCT.has(r.m)) assert.ok(v[j] - v[j + 1] >= 2.99, `${d} ${r.m}`);
    }
  }
});
test("the same five never meet twice; no country twice in a day; never shown already sorted", () => {
  const seen = new Set();
  for (const [d, e] of days) {
    const all = e.rounds.flatMap((r) => r.c.map((x) => x[0]));
    assert.equal(new Set(all).size, e.v === 2 ? 4 : 15, d);
    for (const r of e.rounds) {
      const key = r.c.map((x) => x[0]).sort().join();
      assert.ok(!seen.has(key), `${d} repeats a set`);
      seen.add(key);
      const sorted = r.c.slice().sort((a, b) => b[1] - a[1]).map((x) => x[0]).join();
      assert.notEqual(r.c.map((x) => x[0]).join(), sorted, `${d} ${r.m} already in order`);
    }
  }
});
test("every measure has a question and a format", () => {
  for (const [, e] of days) for (const r of e.rounds) {
    const M = DAILY_MEASURES[r.m];
    assert.ok(M?.q && M.fmt && typeof M.fmt(r.c[0][1]) === "string", r.m);
  }
});

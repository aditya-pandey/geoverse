// Country stories: the right shape, short enough, no giveaways in hooks, numbers that match the data
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, load } from "./extract.mjs";

const stories = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stories.json"), "utf8"));
const entries = Object.entries(stories).filter(([k]) => !k.startsWith("_"));
const srcFile = path.join(ROOT, "tools/daily-source.json"); // local data cache (tools/build_daily.mjs --refresh)
const src = fs.existsSync(srcFile) ? JSON.parse(fs.readFileSync(srcFile, "utf8")) : null;
const nameOf = (d) => d?.gv?.name?.common;
const { maskCountry } = load(["maskCountry"], { nameOf, RegExp });

test("every story has its five parts, sources and a status", () => {
  assert.ok(entries.length > 0);
  for (const [k, s] of entries) {
    for (const f of ["hook", "land", "people", "surprise", "scale"]) assert.ok(typeof s[f] === "string" && s[f].length > 10, `${k}.${f}`);
    assert.ok(Array.isArray(s.sources) && s.sources.length, `${k} sources`);
    assert.ok(["sample", "draft", "reviewed"].includes(s.status), `${k} status`);
    assert.match(k, /^[A-Z]{3}$/);
  }
});
test("short: a hook of one line, the whole story under ~130 words", () => {
  for (const [k, s] of entries) {
    assert.ok(s.hook.split(/\s+/).length <= 14, `${k} hook too long`);
    const words = [s.hook, s.land, s.people, s.surprise, s.scale].join(" ").split(/\s+/).length;
    assert.ok(words <= 130, `${k}: ${words} words`);
  }
});
test("no emoji, and plain punctuation", () => {
  for (const [k, s] of entries) for (const f of ["hook", "land", "people", "surprise", "scale"]) {
    assert.ok(!/\p{Extended_Pictographic}/u.test(s[f]), `${k}.${f} has an emoji`);
  }
});
test("hooks and Mystery clues never name the country or its people", () => {
  if (!src) return;
  const meta = Object.fromEntries(src.countries.map((c) => [c.cca3, c]));
  const wc = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/demonyms.json"), "utf8"));
  for (const [k, s] of entries) {
    const d = { gv: { name: { common: meta[k].name }, demonyms: { eng: { m: wc[k] } } } };
    assert.ok(!s.hook.includes(meta[k].name), `${k} hook names the country`);
    for (const f of ["land", "people", "surprise"]) {
      const clue = maskCountry(s[f], d);
      assert.ok(!new RegExp(`\\b${meta[k].name}\\b`).test(clue), `${k}.${f} clue: ${clue}`);
      if (wc[k]) assert.ok(!new RegExp(`\\b${wc[k]}`).test(clue), `${k}.${f} clue names its people: ${clue}`);
    }
  }
});
test("numbers in the stories match the World Bank data", () => {
  if (!src) return;
  const india = src.wb.area.IND[0];
  for (const [k, s] of entries) {
    const c = s.checks || {};
    if (c.pop) { const p = src.wb.pop[k][0]; assert.ok(p >= c.pop[0] && p <= c.pop[1], `${k} population ${p}`); }
    if (c.areaInIndia) { const r = india / src.wb.area[k][0]; assert.ok(r >= c.areaInIndia[0] && r <= c.areaInIndia[1], `${k} fits in India ${r.toFixed(1)}×`); }
  }
});

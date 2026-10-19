// Story trails and the story of the day
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, load } from "./extract.mjs";

const stories = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stories.json"), "utf8"));
const { STORY_TRAILS } = load(["STORY_TRAILS"]);

test("every trail stop has a written story, and no country repeats in a trail", () => {
  for (const t of STORY_TRAILS) {
    assert.ok(t.stops.length >= 5, t.id);
    assert.equal(new Set(t.stops.map(([k]) => k)).size, t.stops.length, `${t.id} repeats a country`);
    for (const [k, note] of t.stops) {
      assert.ok(stories[k]?.hook, `${t.id}: no story for ${k}`);
      assert.ok(note && note.length < 50, `${t.id}: note for ${k}`);
    }
  }
});
test("story of the day: every story in turn, the same for everyone on a given day", () => {
  const keys = Object.keys(stories).filter((k) => !k.startsWith("_"));
  const byCca3 = new Map(keys.map((k) => [k, { gv: { cca3: k } }]));
  let n = 1;
  const { storyOfDay, mulberry32 } = load(["mulberry32", "shuffleWith", "storyOfDay"], {
    S: { stories, byCca3 }, dailyToday: () => ({ n, iso: `day-${n}` }),
  });
  const seen = [];
  for (n = 1; n <= keys.length; n++) seen.push(storyOfDay().k);
  assert.equal(new Set(seen).size, keys.length, "a story repeated before all were shown");
  n = 7; const a = storyOfDay().k; n = 7; assert.equal(storyOfDay().k, a);
  n = 7 + keys.length; assert.equal(storyOfDay().k, a, "the cycle starts again");
  assert.ok(typeof mulberry32 === "function");
});

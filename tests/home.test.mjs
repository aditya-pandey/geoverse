// The home sheet: four ways in, exactly one recommended, and the right one
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./extract.mjs";

const TOURS = [{ id: "ring-of-fire", title: "The Ring of Fire", stops: [1, 2, 3, 4, 5] }, { id: "great-rivers", title: "Great Rivers", stops: [1, 2, 3, 4] }];
const SOTD = { k: "ISL", d: { gv: { name: { common: "Iceland" } } }, st: { hook: "An island that's slowly being pulled in two." }, iso: "2026-10-19" };
function homeFor({ dailyDone = false, completed = [], paused = null, n = 5, sotd = SOTD, readToday = false } = {}) {
  const S = { toursCompleted: new Set(completed), pausedTour: paused };
  const days = dailyDone ? { [n]: { done: true, score: 230 } } : {};
  const { homeItems } = load(["homeItems"], {
    S, STORY_TOURS: TOURS, dailyToday: () => ({ n }), dailyMemory: () => ({ days }), storyOfDay: () => sotd,
    store: { get: (k, f) => (k === "gv-sotd" && readToday ? SOTD.iso : f), set() {} }, nameOf: (d) => d.gv.name.common,
    openDaily() {}, resumeTour() {}, startStoryTour() {}, selectCountry() {}, setMode() {}, track() {},
  });
  return homeItems();
}

test("four choices, exactly one recommended, and it comes first", () => {
  const items = homeFor();
  assert.equal(items.map((i) => i.id).sort().join(), "daily,maps,sotd,story");
  assert.equal(items.filter((i) => i.rec).length, 1);
  assert.ok(items[0].rec);
});
test("recommended: today's puzzle, then today's story, then a trail", () => {
  assert.equal(homeFor()[0].id, "daily");
  assert.equal(homeFor({ dailyDone: true })[0].id, "sotd");
  assert.equal(homeFor({ dailyDone: true, readToday: true })[0].id, "story");
  assert.match(homeFor({ dailyDone: true }).find((i) => i.id === "daily").sub, /230 of 300/);
});
test("today's story shows its country and hook; no stories yet means three cards", () => {
  const s = homeFor().find((i) => i.id === "sotd");
  assert.equal(s.title, "Today's story: Iceland");
  assert.match(s.sub, /pulled in two/);
  assert.equal(homeFor({ sotd: null }).length, 3);
});
test("the trail card suggests one you haven't finished, or resumes a paused one", () => {
  assert.match(homeFor({ completed: ["ring-of-fire"] }).find((i) => i.id === "story").sub, /Great Rivers/);
  const paused = homeFor({ paused: { tour: TOURS[0], stopIndex: 2 } }).find((i) => i.id === "story");
  assert.equal(paused.title, "Carry on your story trail");
  assert.match(paused.sub, /stop 3 of 5/);
});

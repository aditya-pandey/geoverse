// Daily Bhoogol: puzzle numbers, scoring, ranking, streak maths (pure parts of app.js)
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./extract.mjs";

const fmtFull = new Intl.NumberFormat("en");
const days = {};
const store = { get: (k, f) => (k === "gv-daily" ? { device: "x", days } : f), set() {} };
const D = load(["DAILY_EPOCH", "dailyToday", "dailyTruth", "dailyMarks", "dailyPoints", "dailyRankLine", "dailyMemory", "dailyStats", "dailyCountdown"], { fmtFull, store, crypto: globalThis.crypto, Uint8Array });

test("puzzle number follows the visitor's own calendar", () => {
  assert.equal(D.dailyToday(new Date(2026, 9, 18, 0, 1)).n, 1);
  assert.equal(D.dailyToday(new Date(2026, 9, 18, 23, 59)).n, 1);
  assert.equal(D.dailyToday(new Date(2026, 9, 19, 0, 0)).n, 2);
  assert.equal(D.dailyToday(new Date(2027, 9, 18, 12)).n, 366);
  assert.equal(D.dailyToday(new Date(2027, 2, 28, 12)).iso, "2027-03-28"); // across a DST change
});
test("marks and points: right spot 20, one off 10", () => {
  const truth = ["A", "B", "C", "D", "E"];
  assert.equal(D.dailyMarks(truth, truth), "ggggg");
  assert.equal(D.dailyPoints("ggggg"), 100);
  assert.equal(D.dailyMarks(["B", "A", "C", "E", "D"], truth), "yygyy");
  assert.equal(D.dailyMarks([...truth].reverse(), truth), "rrgrr");
  assert.equal(D.dailyPoints("rrgrr"), 20);
  assert.deepEqual(D.dailyTruth({ c: [["X", 3], ["Y", 9], ["Z", 1]] }), ["Y", "X", "Z"]);
});
test("ranking: quiet with few players, ties aren't beaten, best of the day", () => {
  const few = new Array(31).fill(0); few[20] = 5;
  assert.equal(D.dailyRankLine(200, few, true).pct, null);
  const h = new Array(31).fill(0); h[10] = 60; h[20] = 39; h[25] = 1;
  assert.equal(D.dailyRankLine(200, h, true).pct, 61);
  assert.equal(D.dailyRankLine(250, h, true).pct, 100);
  assert.equal(D.dailyRankLine(250, h, false).pct, 100);
});
test("streaks count back from today, or from yesterday if today isn't played yet", () => {
  Object.assign(days, { 10: { done: true }, 11: { done: true }, 12: { done: true }, 8: { done: true } });
  assert.deepEqual({ ...D.dailyStats(12) }, { played: 4, streak: 3, best: 3 });
  assert.equal(D.dailyStats(13).streak, 3);
  assert.equal(D.dailyStats(14).streak, 0);
});
test("countdown to the visitor's midnight", () => {
  assert.equal(D.dailyCountdown(new Date(2026, 9, 18, 22, 30)), "1h 30m");
  assert.equal(D.dailyCountdown(new Date(2026, 9, 18, 23, 59, 30)), "1m");
});

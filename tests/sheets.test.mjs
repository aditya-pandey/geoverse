// The phone card gestures: one swipe, one meaning
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./extract.mjs";

const { sheetGestureMode: mode, sheetTarget: target } = load(["sheetGestureMode", "sheetTarget"]);

test("swiping up on the text grows the card until it's full", () => {
  assert.equal(mode({ state: "peek", dy: -8 }), "sheet");
  assert.equal(mode({ state: "half", dy: -3, scrollTop: 0 }), "sheet");
});
test("once full, swiping up scrolls the text", () => {
  assert.equal(mode({ state: "full", dy: -8, scrollTop: 0 }), "native");
  assert.equal(mode({ state: "full", dy: -8, scrollTop: 300 }), "native");
});
test("swiping down scrolls back to the top first, then shrinks the card", () => {
  assert.equal(mode({ state: "full", dy: 6, scrollTop: 120 }), "native");
  assert.equal(mode({ state: "full", dy: 6, scrollTop: 0 }), "sheet");
  assert.equal(mode({ state: "half", dy: 6, scrollTop: 0 }), "sheet");
});
test("sideways swipes are left alone", () => {
  assert.equal(mode({ state: "half", dy: -2, dx: 9 }), "native");
});

const snaps = [["peek", 200], ["half", 440], ["full", 730]];
test("a slow release settles at the nearest height", () => {
  assert.equal(target(snaps, 470, 0)[0], "half");
  assert.equal(target(snaps, 650, 0.1)[0], "full");
  assert.equal(target(snaps, 260, -0.2)[0], "peek");
});
test("a flick goes one step in its direction", () => {
  assert.equal(target(snaps, 450, -0.8)[0], "full");
  assert.equal(target(snaps, 430, 0.8)[0], "peek");
  assert.equal(target(snaps, 735, -0.8)[0], "full"); // already at the top: stays
  assert.equal(target(snaps, 195, 0.9)[0], "peek");
});

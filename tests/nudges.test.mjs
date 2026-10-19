// Explore nudges: what "Next" suggests after you close a country, and today's three
import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./extract.mjs";

const C = (k, name, borders = []) => ({ gv: { cca3: k, name: { common: name }, borders } });
const IND = C("IND", "India", ["NPL", "PAK"]), NPL = C("NPL", "Nepal", ["IND", "CHN"]), PAK = C("PAK", "Pakistan", ["IND"]), CHN = C("CHN", "China", ["NPL"]);
const all = new Map([IND, NPL, PAK, CHN].map((d) => [d.gv.cca3, d]));
function nextFn({ read = [], trails = [] } = {}) {
  const S = { byCca3: all, readStories: new Set(read) };
  const { nextFor } = load(["nextFor"], {
    S, nameOf: (d) => d.gv.name.common, storyOf: (d) => (d ? { hook: "x" } : null), trailsOf: () => trails,
    selectCountry() {}, startStoryTour() {}, setCompare() {},
  });
  return { nextFor, S };
}

test("suggestions rotate between a neighbour's story, the next trail stop and a comparison", () => {
  const trail = { t: { id: "silk-road", title: "The Silk Road", stops: [{ name: "China" }, { name: "Nepal" }] }, i: 0 };
  const { nextFor } = nextFn({ trails: [trail] });
  const kinds = new Set([nextFor(IND).kind, nextFor(IND).kind, nextFor(IND).kind]);
  assert.equal([...kinds].sort().join(), "compare,neighbour,trail");
});
test("a neighbour is only suggested if its story is still unread", () => {
  const { nextFor } = nextFn({ read: ["NPL", "PAK"] });
  for (let i = 0; i < 4; i++) assert.notEqual(nextFor(IND).kind, "neighbour");
});
test("India compares with China; everyone else compares with India", () => {
  const { nextFor } = nextFn({ read: ["NPL", "PAK", "IND", "CHN"] });
  assert.equal(nextFor(IND).text, "Compare India with China");
  assert.equal(nextFor(PAK).text, "Compare Pakistan with India");
});

// The "better than X%" scoreboard, run against an in-memory store
import test from "node:test";
import assert from "node:assert/strict";
import { handle, liveNumbers, EPOCH_UTC } from "../netlify/daily-core.mjs";

const mem = new Map();
const store = {
  async get(k) { return mem.get(k) ?? null; },
  async set(k, v) { mem.set(k, v); },
  async list({ prefix }) { return { blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const now = EPOCH_UTC + 10 * 864e5 + 6 * 36e5; // puzzle #11, 06:00 UTC
const post = (body, ip = "1.2.3.4") => handle(new Request("https://x/api/daily", { method: "POST", body: JSON.stringify(body) }), store, ip, now);

test("today (and yesterday in the far west) are live; tomorrow isn't", () => {
  const live = liveNumbers(now);
  assert.ok(live.has(11) && live.has(10) && !live.has(12));
});
test("a score is counted once per device", async () => {
  let j = await (await post({ n: 11, score: 230, device: "abcdef123456" })).json();
  assert.equal(j.count, 1);
  assert.equal(j.hist[46], 1); // 230 / 5
  j = await (await post({ n: 11, score: 300, device: "abcdef123456" })).json();
  assert.equal(j.count, 1);
  assert.equal(j.hist[60], 0);
});
test("impossible input is refused", async () => {
  for (const body of [{ n: 11, score: 237, device: "zzzzzz999999" }, { n: 11, score: 310, device: "zzzzzz999999" }, { n: 40, score: 100, device: "zzzzzz999999" }, { n: 11, score: 100, device: "x" }]) {
    assert.equal((await post(body)).status, 400, JSON.stringify(body));
  }
});
test("one network can post at most 6 scores a day", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await post({ n: 11, score: 100, device: `famdevice00${i}x` })).status, 200);
  assert.equal((await post({ n: 11, score: 100, device: "famdevice0099" })).status, 429);
  assert.equal((await post({ n: 11, score: 50, device: "otherdevice001" }, "5.6.7.8")).status, 200);
});
test("GET returns the tally; no raw address is stored", async () => {
  const j = await (await handle(new Request("https://x/api/daily?n=11"), store, "", now + 20000)).json();
  assert.equal(j.count, 7); // 1 + 5 from one network + 1 from another
  assert.equal(j.hist[20], 5); // 100 / 5
  assert.ok(![...mem.keys()].some((k) => k.includes("1.2.3.4")));
});

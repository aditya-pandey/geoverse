// Tracked links: UTM and click-id tags are for analytics, not app state
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, load } from "./extract.mjs";

const { isDeepLink, withoutTracking } = load(["NOT_APP_PARAMS", "TRACKING_PARAMS", "isDeepLink", "withoutTracking"], { URLSearchParams });

test("tracking tags and test switches are not a deep link", () => {
  assert.equal(isDeepLink(""), false);
  assert.equal(isDeepLink("?utm_source=instagram&utm_medium=social&utm_campaign=bio_link"), false);
  assert.equal(isDeepLink("?fbclid=abc&igshid=x&si=y&gclid=z"), false);
  assert.equal(isDeepLink("?notrack&ga_debug&fps=1&intro"), false);
});
test("a real app parameter is still a deep link, with or without tags", () => {
  assert.equal(isDeepLink("?country=IND"), true);
  assert.equal(isDeepLink("?utm_source=youtube&country=IND"), true);
  assert.equal(isDeepLink("?daily"), true);
  assert.equal(isDeepLink("?mode=atlas&utm_campaign=x"), true);
});
test("tidying the address drops only the tracking tags", () => {
  assert.equal(withoutTracking("?utm_source=youtube&utm_medium=social"), "");
  assert.equal(withoutTracking("?country=IND&utm_source=ig&fbclid=1"), "?country=IND");
  assert.equal(withoutTracking("?notrack&utm_source=li"), "?notrack=");
});
test("the short links in _redirects are exact paths with UTM tags", () => {
  const rules = fs.readFileSync(path.join(ROOT, "_redirects"), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.trim().split(/\s+/));
  assert.deepEqual(rules.map(([from]) => from).join(), "/yt,/ig,/story,/li");
  for (const [from, to, code] of rules) {
    assert.equal(code, "302", from);
    assert.ok(!from.includes("*") && !from.startsWith("/api") && !from.startsWith("/data"), from);
    const q = new URL(to, "https://x").searchParams;
    assert.ok(q.get("utm_source") && q.get("utm_medium") && q.get("utm_campaign"), from);
  }
});

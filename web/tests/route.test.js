// Tests for route.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import { pageFromHash, hashFor } from "../js/route.js";

const ON = ["sleep", "work"];

test("pageFromHash", () => {
  assert.strictEqual(pageFromHash("", ON), "home");
  assert.strictEqual(pageFromHash("#", ON), "home");
  assert.strictEqual(pageFromHash("#/", ON), "home");
  assert.strictEqual(pageFromHash("#/sleep", ON), "sleep");
  assert.strictEqual(pageFromHash("#/settings", ON), "settings");
  assert.strictEqual(pageFromHash("#/insights", ON), "insights");
  assert.strictEqual(pageFromHash("#/insights", []), "insights");
  assert.strictEqual(pageFromHash("#/focus", ON), "focus"); // Work is on
  assert.strictEqual(pageFromHash("#/focus", ["study", "sleep"]), "focus");
  assert.strictEqual(pageFromHash("#/focus", ["sleep"]), "home"); // neither timer module is on
  assert.strictEqual(pageFromHash("#/focus/stats", ON), "focus-stats");
  assert.strictEqual(pageFromHash("#/focus/stats", ["sleep"]), "home");
  assert.strictEqual(pageFromHash("#/study", ON), "home"); // switched off
  assert.strictEqual(pageFromHash("#/sleep/x", ON), "home");
  assert.strictEqual(pageFromHash("#settings", ON), "home");
  assert.strictEqual(pageFromHash("#/SLEEP", ON), "home");
  assert.strictEqual(pageFromHash("#/toString", ON), "home");
});

test("hashFor", () => {
  assert.strictEqual(hashFor("home"), "#/");
  assert.strictEqual(hashFor("work"), "#/work");
  assert.strictEqual(hashFor("settings"), "#/settings");
});

test("the Focus stats page has its own address", () => {
  assert.strictEqual(hashFor("focus-stats"), "#/focus/stats");
});

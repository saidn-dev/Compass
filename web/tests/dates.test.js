// Tests for dates.js, run with: node --test web/tests/*.test.js
import test from "node:test";
import assert from "node:assert";
import { parseDate, dateHint } from "../js/dates.js";

const TODAY = "2026-11-20"; // a Friday

const read = (text, today = TODAY) => {
  const got = parseDate(text, today);
  return got === null ? null : got.date;
};

test("blank is no date, not an error", () => {
  assert.deepStrictEqual(parseDate("", TODAY), { date: null });
  assert.deepStrictEqual(parseDate("   ", TODAY), { date: null });
});

test("ISO dates are kept and checked", () => {
  assert.strictEqual(read("2026-12-05"), "2026-12-05");
  assert.strictEqual(read("2026-02-30"), null);
});

test("today, tomorrow and next week", () => {
  assert.strictEqual(read("Today"), TODAY);
  assert.strictEqual(read("tomorrow"), "2026-11-21");
  assert.strictEqual(read("next week"), "2026-11-27");
});

test("in N days, weeks and months", () => {
  assert.strictEqual(read("in 12 days"), "2026-12-02");
  assert.strictEqual(read("12 days"), "2026-12-02");
  assert.strictEqual(read("in a week"), "2026-11-27");
  assert.strictEqual(read("in three weeks"), "2026-12-11");
  assert.strictEqual(read("in 2 months"), "2027-01-20");
  assert.strictEqual(read("in a month", "2027-01-31"), "2027-02-28");
  assert.strictEqual(read("in lots days"), null);
});

test("weekdays: the coming one, and next never means today", () => {
  assert.strictEqual(read("monday"), "2026-11-23");
  assert.strictEqual(read("Next Monday"), "2026-11-23");
  assert.strictEqual(read("this mon"), "2026-11-23");
  assert.strictEqual(read("friday"), TODAY);
  assert.strictEqual(read("next friday"), "2026-11-27");
});

test("day and month, either order, with or without a year", () => {
  assert.strictEqual(read("5 Dec"), "2026-12-05");
  assert.strictEqual(read("5th of December"), "2026-12-05");
  assert.strictEqual(read("Dec 5"), "2026-12-05");
  assert.strictEqual(read("december 5th, 2027"), "2027-12-05");
  assert.strictEqual(read("20 nov"), TODAY);
  assert.strictEqual(read("3 Jan"), "2027-01-03"); // passed this year, so next year's
  assert.strictEqual(read("29 feb"), "2028-02-29");
  assert.strictEqual(read("31 apr"), null);
});

test("unreadable text is null", () => {
  assert.strictEqual(read("soon"), null);
  assert.strictEqual(read("5/12"), null);
  assert.strictEqual(read("ma 5"), null);
});

test("dateHint names the day and how far away it is", () => {
  assert.strictEqual(dateHint("2026-12-05", TODAY), "Sat 5 Dec 2026 · in 15 days");
  assert.strictEqual(dateHint(TODAY, TODAY), "Fri 20 Nov 2026 · today");
  assert.strictEqual(dateHint("2026-11-21", TODAY), "Sat 21 Nov 2026 · tomorrow");
  assert.strictEqual(dateHint("2026-11-01", TODAY), "Sun 1 Nov 2026 · date passed");
});

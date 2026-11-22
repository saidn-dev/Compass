// Tests for stats.js and the stats page's period card, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import { canStep, focusPeriod, focusStreaks, minutesByHour, periodLabel, periodRange, pomoCounts } from "../js/stats.js";
import { renderFocusAchievements, renderStatsPeriod } from "../js/render.js";

const TODAY = "2026-11-19"; // a Thursday
const S = (date, area, minutes, ended_at = "10:00", task = null) => ({ date, id: `${date}${ended_at}`, area, task, minutes, ended_at, note: null });
const SESSIONS = [
  S("2026-11-19", "study", 50, "10:00", "Essay"),
  S("2026-11-19", "work", 25, "12:00"),
  S("2026-11-17", "study", 30, "09:30", "Essay"),
  S("2026-11-16", "work", 90, "17:00", "Invoices"),
  S("2026-11-09", "study", 40, "11:00", "Revise"),   // last week
  S("2026-10-30", "work", 60, "15:00", "Invoices"),  // last month
];

test("periods: today's day, a Monday-to-Sunday week and the calendar month", () => {
  assert.deepStrictEqual(periodRange("day", 0, TODAY).dates, [TODAY]);
  const week = periodRange("week", 0, TODAY);
  assert.strictEqual(week.start, "2026-11-16");
  assert.strictEqual(week.end, "2026-11-22");
  assert.strictEqual(periodRange("week", -1, TODAY).start, "2026-11-09");
  const month = periodRange("month", -1, TODAY);
  assert.strictEqual(month.start, "2026-10-01");
  assert.strictEqual(month.dates.length, 31);
  assert.strictEqual(periodRange("month", -9, TODAY).dates.length, 28); // February 2026
});

test("period labels read like TickTick's", () => {
  const label = (p, o) => periodLabel(p, o, periodRange(p, o, TODAY));
  assert.deepStrictEqual([label("day", 0), label("day", -1), label("day", -2)], ["Today", "Yesterday", "Tue 17 Nov"]);
  assert.deepStrictEqual([label("week", 0), label("week", -1), label("week", -2)], ["This week", "Last week", "2–8 Nov"]);
  assert.strictEqual(label("week", -3), "26 Oct – 1 Nov");
  assert.strictEqual(label("month", 0), "November 2026");
});

test("a week sums its sessions, splits Study and Work, ranks tasks and averages over the days so far", () => {
  const p = focusPeriod(SESSIONS, TODAY, "week", 0, { goalNames: ["Essay"] });
  assert.strictEqual(p.minutes, 195);
  assert.strictEqual(p.count, 4);
  assert.deepStrictEqual(p.byArea, { study: 80, work: 115 });
  assert.deepStrictEqual(p.tasks.map((t) => [t.task, t.minutes, t.count, t.goal]),
    [["Invoices", 90, 1, false], ["Essay", 80, 2, true], [null, 25, 1, false]]);
  assert.strictEqual(p.days, 4); // Monday to Thursday
  assert.strictEqual(p.average, 49); // 195 / 4
  assert.strictEqual(p.activeDays, 3);
  assert.strictEqual(p.goalDays, null);
  assert.strictEqual(p.buckets.length, 7);
  assert.deepStrictEqual(p.buckets[0], { key: "2026-11-16", study: 0, work: 90 });
});

test("with a daily goal the period counts the days that reach it", () => {
  assert.strictEqual(focusPeriod(SESSIONS, TODAY, "week", 0, { goal: 60 }).goalDays, 2); // Mon 90, Thu 75
});

test("a day's bars are its hours, a session spread over the hours it ran", () => {
  const p = focusPeriod(SESSIONS, TODAY, "day", 0);
  assert.strictEqual(p.buckets.length, 24);
  assert.strictEqual(p.buckets[9].study, 50); // 9:10-10:00
  assert.strictEqual(p.buckets[11].work, 25);
  assert.strictEqual(p.longest, 50);
  const wrapped = minutesByHour([S(TODAY, "study", 30, "00:10")]); // 23:40 to 00:10
  assert.deepStrictEqual([wrapped[23], wrapped[0]], [20, 10]);
});

test("the arrows stop at today and at the first day the payload holds", () => {
  assert.deepStrictEqual(canStep("week", 0, TODAY, "2025-11-20"), { back: true, forward: false });
  assert.deepStrictEqual(canStep("week", -1, TODAY, "2026-11-16"), { back: false, forward: true });
  assert.deepStrictEqual(canStep("month", 0, TODAY, "2026-10-31"), { back: true, forward: false });
});

test("streaks count focus days, or goal days when there is a goal, and today may still be open", () => {
  const year = [10, 0, 30, 70, 80, 0].map((minutes, i) => ({ date: `2026-11-${14 + i}`, minutes }));
  assert.deepStrictEqual(focusStreaks(year), { longest: 3, current: 3 });
  assert.deepStrictEqual(focusStreaks(year, 60), { longest: 2, current: 2 });
  assert.deepStrictEqual(focusStreaks([]), { longest: 0, current: 0 });
});

const DATA = { sessions: SESSIONS, year: [{ date: "2025-11-20", minutes: 0 }] };

test("the period card has the switch, arrows, tiles, bars, a ring and the ranking", () => {
  const html = renderStatsPeriod(DATA, TODAY, { period: "week", offset: 0 }, { goalNames: ["Essay"] });
  assert.ok(html.includes('id="stats-period"'));
  assert.ok(html.includes('data-stats-period="week"\n        aria-pressed="true"') || /data-stats-period="week"\s+aria-pressed="true"/.test(html));
  assert.ok(/data-stats-step="1"[^>]*disabled/.test(html) && !/data-stats-step="-1"[^>]*disabled/.test(html));
  assert.ok(html.includes(">This week</h2>"));
  assert.ok(html.includes("3 h 15 min") && html.includes("Daily average") && html.includes("Days with focus"));
  assert.ok(html.includes('class="focus-donut"') && html.includes("Study 1 h 20 min (41%), Work 1 h 55 min (59%)"));
  assert.ok(html.indexOf("Invoices") < html.indexOf("Essay") && html.includes("Study goal") && html.includes("No task"));
});

test("a day shows its longest session and hour bars; an empty period says so", () => {
  const day = renderStatsPeriod(DATA, TODAY, { period: "day", offset: 0 });
  assert.ok(day.includes("Longest session") && day.includes("is-dense") && day.includes("By hour"));
  const empty = renderStatsPeriod(DATA, TODAY, { period: "day", offset: -5 }, { goal: 60 });
  assert.ok(empty.includes("No sessions in this period.") && empty.includes("No focus in this period."));
  assert.ok(empty.includes("Goal met") && empty.includes("0 of 1"));
});

test("achievements show the level, the way to the next and earned badges", () => {
  const html = renderFocusAchievements({
    level: 5, hours: 21, next_hours: 40, progress: 0.05, sessions: 7, longest_streak: 7, goal_days: 7,
    badges: [{ id: "first", label: "First session", how: "Finish a focus session", earned: true },
      { id: "hours-100", label: "100 hours", how: "Focus for 100 hours in all", earned: false }],
  });
  assert.ok(html.includes(">Level 5</h2>") && html.includes("21 h of focus · 19 h to level 6"));
  assert.ok(html.includes('aria-valuenow="5"'));
  assert.ok(/class="badge" data-earned[\s\S]*First session[\s\S]*Earned/.test(html));
  assert.ok(/100 hours[\s\S]*Not yet/.test(html));
  const top = renderFocusAchievements({ level: 13, hours: 1200, next_hours: null, progress: 1, badges: [] });
  assert.ok(top.includes("The top level.") && top.includes("Top level reached"));
});

test("pomo counts are sessions per named task", () => {
  assert.deepStrictEqual(pomoCounts(SESSIONS), { Essay: 2, Invoices: 2, Revise: 1 });
});

test("a stacked bar never runs past the top of its chart", () => {
  const both = [S(TODAY, "study", 120, "10:00"), S(TODAY, "work", 120, "14:00"), S("2026-11-18", "study", 150, "10:00")];
  const html = renderStatsPeriod({ sessions: both, year: DATA.year }, TODAY, { period: "week", offset: 0 });
  const stacks = [...html.matchAll(/week-bar-stack" style="--height: ([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.ok(stacks.length > 0 && Math.max(...stacks) === 100);
});

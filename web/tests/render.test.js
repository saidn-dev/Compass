// Tests for render.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  escapeHtml, renderBrief, renderAreaCard, renderOnboarding,
  renderHabitGrid, renderGoals, renderTasks,
  renderTargetRows, renderHabitList, renderGoalList,
} from "../js/render.js";

const EVIL = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";

const card = (over = {}) => ({
  id: "sleep", label: "Sleep", unit: "h", value: 6.4, target: 7.5, mode: "up",
  status: "Behind", progress: 85.3, trend: "down", series: [], ...over,
});

const AREAS = [
  { id: "sleep", label: "Sleep", unit: "h", default_target: 7.5, default_mode: "up" },
  { id: "spending", label: "Spending", unit: "%", default_target: 100, default_mode: "limit" },
];

// --- escapeHtml (Review Focus 3) ---

test("escapeHtml removes every < from markup", () => {
  assert.ok(!escapeHtml(IMG).includes("<"));
  assert.strictEqual(escapeHtml(`a & b "c" 'd'`), "a &amp; b &quot;c&quot; &#39;d&#39;");
});

test("escapeHtml turns non-strings into text", () => {
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(5), "5");
});

// --- no renderer lets user text through as markup ---

test("tasks, goals, habits never contain raw <script", () => {
  const html = [
    renderTasks([{ text: EVIL, done: false }]),
    renderGoals([{ name: EVIL, percent: 10, detail: EVIL }]),
    renderHabitGrid([{ id: "h1", name: EVIL, days: [{ date: "2026-10-21", done: true }] }], [{ id: "h1", name: EVIL }]),
    renderBrief({ sentences: [EVIL], facts: [] }),
    renderAreaCard(card({ label: EVIL })),
    renderOnboarding([{ ...AREAS[0], label: EVIL }], []),
  ].join("");
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("&lt;script&gt;"));
});

// --- area card ---

test("area card shows status in words", () => {
  assert.ok(renderAreaCard(card({ status: "On track" })).includes("On track"));
  assert.ok(renderAreaCard(card({ status: "Behind" })).includes("Behind"));
  assert.ok(renderAreaCard(card({ status: "No data", value: null, progress: null })).includes("No data"));
});

test("area card sets data-status from the words", () => {
  assert.ok(renderAreaCard(card({ status: "On track" })).includes('data-status="on_track"'));
  assert.ok(renderAreaCard(card({ status: "No data", value: null })).includes('data-status="no_data"'));
});

test("area card aria-label has value and target", () => {
  const label = renderAreaCard(card()).match(/aria-label="([^"]*)"/)[1];
  assert.ok(label.includes("6.4"));
  assert.ok(label.includes("7.5"));
});

test("area card with no data shows a dash, not 0", () => {
  const html = renderAreaCard(card({ status: "No data", value: null, progress: null, trend: "none" }));
  assert.ok(html.includes('<span class="value">-</span>'));
  assert.ok(!html.includes(">0<"));
});

test("area card progress bar is capped at 100%", () => {
  assert.ok(renderAreaCard(card({ progress: 180 })).includes("--progress: 100%"));
});

// --- onboarding ---

test("onboarding says choose up to 5 and ticks selected modules", () => {
  const html = renderOnboarding(AREAS, ["spending"]);
  assert.ok(html.includes("Choose up to 5"));
  assert.ok(/value="spending" checked/.test(html));
  assert.ok(!/value="sleep" checked/.test(html));
});

// --- brief ---

test("brief shows one paragraph per sentence and the numbers used", () => {
  const html = renderBrief({
    sentences: ["One.", "Two.", "Three."],
    facts: [{ area_id: "sleep", value: 6.4, target: 7.5, mode: "up" }],
  });
  assert.strictEqual(html.match(/class="brief-text"/g).length, 3);
  assert.ok(html.includes("Numbers used"));
  assert.ok(html.includes("6.4"));
});

test("brief with no facts has no Numbers used section", () => {
  assert.ok(!renderBrief({ sentences: ["Log today's numbers to get your first brief."], facts: [] }).includes("Numbers used"));
});

// --- habits ---

test("habit grid marks done, not done and gap days", () => {
  const html = renderHabitGrid(
    [{ id: "walk", name: "Walk", days: [
      { date: "2026-10-19", done: true },
      { date: "2026-10-20", done: false },
      { date: "2026-10-21", done: null },
    ] }],
    [{ id: "walk", name: "Walk" }],
  );
  assert.strictEqual(html.match(/aria-pressed="true"/g).length, 1);
  assert.strictEqual(html.match(/data-gap/g).length, 1);
  assert.ok(html.includes('data-habit="walk"'));
  assert.ok(html.includes('data-date="2026-10-21"'));
});

test("empty lists show a friendly message", () => {
  assert.ok(renderHabitGrid([], []).includes('class="empty"'));
  assert.ok(renderGoals([]).includes('class="empty"'));
  assert.ok(renderTasks([]).includes('class="empty"'));
});

// --- tasks ---

test("done tasks are marked is-done and checked", () => {
  const html = renderTasks([{ text: "A", done: true }, { text: "B", done: false }]);
  assert.strictEqual(html.match(/is-done/g).length, 1);
  assert.strictEqual(html.match(/ checked/g).length, 1);
  assert.ok(html.includes('data-index="1"'));
});

// --- settings lists ---

test("target rows show each enabled module with its current target and mode", () => {
  const html = renderTargetRows(AREAS, {
    modules: ["spending"],
    targets: [{ area_id: "spending", target: 90, mode: "limit" }],
  });
  assert.ok(html.includes('data-area="spending"'));
  assert.ok(!html.includes('data-area="sleep"'));
  assert.ok(html.includes('value="90"'));
  assert.ok(/<option value="limit" selected>/.test(html));
});

test("target rows fall back to the default target", () => {
  const html = renderTargetRows(AREAS, { modules: ["sleep"], targets: [] });
  assert.ok(html.includes('value="7.5"'));
  assert.ok(/<option value="up" selected>/.test(html));
});

test("settings lists escape names and have remove buttons", () => {
  const habits = renderHabitList([{ id: "h1", name: EVIL }]);
  const goals = renderGoalList([{ name: IMG, percent: 40, detail: "" }]);
  assert.ok(!(habits + goals).includes("<script"));
  assert.ok(!(habits + goals).includes("<img"));
  assert.ok(habits.includes('data-remove-habit="0"'));
  assert.ok(goals.includes('data-remove-goal="0"'));
  assert.ok(goals.includes('data-edit-goal="0"'));
});

test("empty settings lists say so", () => {
  assert.ok(renderHabitList([]).includes('class="empty"'));
  assert.ok(renderGoalList([]).includes('class="empty"'));
});

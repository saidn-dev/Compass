// Tests for render.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  escapeHtml, renderBrief, renderAreaCard, renderOnboarding,
  renderHabitGrid, renderGoals, renderTasks,
  renderTargetRows, renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
  renderStudyGoals, WORK_QUESTIONS, renderWorkQuestion, weekHoursText,
} from "../js/render.js";

const EVIL = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";

const card = (over = {}) => ({
  id: "sleep", label: "Sleep", unit: "h", value: 6.4, target: 7.5, mode: "up",
  status: "Behind", progress: 85.3, trend: "down", series: [], ...over,
});

const AREAS = [
  { id: "sleep", label: "Sleep", unit: "h", default_target: 7.5, default_mode: "up" },
  { id: "work", label: "Work", unit: "h", default_target: 16, default_mode: "up" },
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

test("onboarding says choose up to 3 and ticks selected modules", () => {
  const html = renderOnboarding(AREAS, ["work"]);
  assert.ok(html.includes("Choose up to 3"));
  assert.ok(/value="work" checked/.test(html));
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

test("brief shows a bedtime fact in words", () => {
  const html = renderBrief({
    sentences: ["In bed after 22:30 on 3 of 6 nights."],
    facts: [{ area_id: "sleep", kind: "bedtime", value: 3, nights: 6, bedtime: "22:30" }],
  });
  assert.ok(html.includes("Sleep: in bed late on 3 of 6 nights (bedtime 22:30)"));
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
    modules: ["work"],
    targets: [{ area_id: "work", target: 90, mode: "limit" }],
  });
  assert.ok(html.includes('data-area="work"'));
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

// --- target rows: each place gets its own ids ---

test("target rows take an id prefix and can skip areas", () => {
  const settings = { modules: ["sleep", "work"], targets: [] };
  const onboarding = renderTargetRows(AREAS, settings, { prefix: "onb-target", skip: ["sleep"] });
  assert.ok(onboarding.includes('id="onb-target-work"'));
  assert.ok(onboarding.includes('for="onb-target-work"'));
  assert.ok(!onboarding.includes("sleep"));
  assert.ok(renderTargetRows(AREAS, settings).includes('id="target-sleep"'));
});

// --- sleep ---

const SLEEP_GOAL = { targets: [{ area_id: "sleep", target: 7.5, mode: "up" }], sleep_schedule: null };
const SLEEP_SCHEDULE = {
  targets: [{ area_id: "sleep", target: 8, mode: "up" }],
  sleep_schedule: { bedtime: "22:30", wake_time: "06:30" },
};

// Every <input id="x"> has a <label for="x">.
function assertEveryInputLabelled(html) {
  const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  const labelled = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(labelled.has(id), `no label for ${id}`);
}

test("gapText shows the hours between two times", () => {
  assert.strictEqual(gapText("22:30", "06:30"), "= 8 h a night");
  assert.strictEqual(gapText("23:00", "06:30"), "= 7.5 h a night");
  assert.strictEqual(gapText("", "06:30"), "");
  assert.strictEqual(gapText("22:00", "22:00"), "");
});

test("sleep choice opens on the goal with the saved target", () => {
  const html = renderSleepChoice(SLEEP_GOAL, "onb", true);
  assert.strictEqual(html.match(/type="radio"/g).length, 3);
  assert.ok(/value="goal" checked/.test(html));
  assert.ok(html.includes('value="7.5"'));
  assert.ok(/class="sleep-panel sleep-times" data-mode="schedule" hidden/.test(html));
  assert.ok(html.includes("Do you already know what you want from your sleep?"));
  assertEveryInputLabelled(html);
});

test("sleep choice opens on the schedule when one is saved", () => {
  const html = renderSleepChoice(SLEEP_SCHEDULE, "set", false);
  assert.ok(/value="schedule" checked/.test(html));
  assert.ok(html.includes('value="22:30"') && html.includes('value="06:30"'));
  assert.ok(html.includes("= 8 h a night"));
  assert.ok(!html.includes('value="help"'));
  assert.ok(html.includes('id="set-sleep-bed"'));
  assertEveryInputLabelled(html);
});

test("sleep suggestion with a schedule shows editable times", () => {
  const html = renderSleepSuggestion({ hours: 8, range: "7-9 h", bedtime: "22:30", wake_time: "06:30", tips: [EVIL], notes: [] });
  assert.ok(html.includes('id="onb-sugg-bed"') && html.includes('id="onb-sugg-wake"'));
  assert.ok(!html.includes('id="onb-sugg-hours"'));
  assert.ok(html.includes("7-9 h"));
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("General guidance, not medical advice."));
  assertEveryInputLabelled(html);
});

test("sleep suggestion without a schedule shows hours and notes", () => {
  const note = "Shift work makes a fixed schedule hard; an hours-a-night goal may suit you better.";
  const html = renderSleepSuggestion({ hours: 8, range: "7-9 h", bedtime: null, wake_time: null, tips: [], notes: [note] });
  assert.ok(html.includes('id="onb-sugg-hours"') && html.includes('value="8"'));
  assert.ok(!html.includes('id="onb-sugg-bed"'));
  assert.ok(!html.includes("sleep-tips"));
  assert.ok(html.includes(note));
  assertEveryInputLabelled(html);
});

// --- Study ---

const count = (html, needle) => html.split(needle).length - 1;

test("renderStudyGoals with no goals draws one empty row and the hours", () => {
  const html = renderStudyGoals([], 12, "onb");
  assert.strictEqual(count(html, 'class="study-goal-row"'), 1);
  assert.ok(!html.includes("data-remove-study"));
  assert.ok(html.includes("data-add-study"));
  assert.ok(html.includes('id="onb-study-hours"'));
  assert.ok(html.includes('for="onb-study-hours"'));
  assert.ok(html.includes('value="12"'));
  assert.ok(html.includes("What are you studying for?"));
  assert.ok(html.includes("Leave the date blank if there isn't one."));
});

test("renderStudyGoals with two goals gives each a Remove button", () => {
  const html = renderStudyGoals([{ name: "A", date: null }, { name: "B", date: null }], 12, "onb");
  assert.strictEqual(count(html, 'class="study-goal-row"'), 2);
  assert.strictEqual(count(html, "data-remove-study="), 2);
});

test("renderStudyGoals at five goals hides Add and says so", () => {
  const goals = [1, 2, 3, 4, 5].map((n) => ({ name: `G${n}`, date: null }));
  const html = renderStudyGoals(goals, 12, "onb");
  assert.ok(!html.includes("data-add-study"));
  assert.ok(html.includes("Up to 5 goals."));
});

test("renderStudyGoals escapes names and keeps dates", () => {
  const html = renderStudyGoals([{ name: EVIL, date: "2026-12-12" }], 12, "onb");
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes('value="2026-12-12"'));
});

test("renderStudyGoals gives every input a matching label", () => {
  const html = renderStudyGoals([{ name: "A", date: null }, { name: "B", date: "2026-12-12" }], 12, "set");
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`), `no label for ${id}`);
});

test("renderAreaCard shows the study goal line", () => {
  const html = renderAreaCard(card({ id: "study", label: "Study", goal: { text: "Exam · in 12 days" } }));
  assert.ok(html.includes('class="card-goal"'));
  assert.ok(html.includes("Exam · in 12 days"));
  assert.match(html, /aria-label="[^"]*, Exam · in 12 days"/);
});

test("renderAreaCard escapes the goal line and leaves it out without a goal", () => {
  assert.ok(!renderAreaCard(card({ goal: { text: IMG } })).includes("<img"));
  assert.ok(!renderAreaCard(card()).includes("card-goal"));
  assert.ok(!renderAreaCard(card({ goal: null })).includes("card-goal"));
});

test("renderBrief shows a deadline fact, escaped", () => {
  const fact = { area_id: "study", kind: "deadline", name: EVIL, date: "2026-12-12", days_left: 12 };
  const html = renderBrief({ sentences: ["x"], facts: [fact] });
  assert.ok(html.includes("12 days left"));
  assert.ok(!html.includes("<script"));
  const passed = renderBrief({ sentences: ["x"], facts: [{ ...fact, name: "Exam", days_left: -2 }] });
  assert.ok(passed.includes("Study: Exam, 2026-12-12 (date passed)"));
});

test("renderBrief says today and tomorrow instead of 0 and 1 days left", () => {
  const fact = (days_left) => ({ area_id: "study", kind: "deadline", name: "Exam", date: "2026-12-12", days_left });
  const html = (n) => renderBrief({ sentences: [], facts: [fact(n)] });
  assert.ok(html(0).includes("(today)"));
  assert.ok(html(1).includes("(tomorrow)"));
  assert.ok(html(2).includes("(2 days left)"));
  assert.ok(html(-1).includes("(date passed)"));
});

test("renderSleepChoice in Settings has a plain Sleep legend", () => {
  const settings = { sleep_schedule: null, targets: [] };
  assert.ok(renderSleepChoice(settings, "set", false).includes("<legend>Sleep</legend>"));
  assert.ok(renderSleepChoice(settings, "onb", true).includes("Do you already know"));
});

// --- Work ---

const WORK = {
  kind: "student", role: "Dev", schedule: { days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00" },
  hours_vary: false, focus: "evening", goal: "Fix 3 bugs", derailers: ["energy"],
};

test("renderWorkQuestion redraws saved answers", () => {
  assert.match(renderWorkQuestion(0, WORK, "", "onb"), /value="student"[^>]*checked/);
  assert.ok(!/value="employed"[^>]*checked/.test(renderWorkQuestion(0, WORK, "", "onb")));
  const derail = renderWorkQuestion(5, WORK, "", "onb");
  assert.strictEqual((derail.match(/ checked/g) || []).length, 1);
  assert.match(derail, /value="energy"[^>]*checked/);
  const days = renderWorkQuestion(2, WORK, "", "onb");
  assert.strictEqual((days.match(/aria-pressed="true"/g) || []).length, 5);
  assert.strictEqual((days.match(/aria-pressed="false"/g) || []).length, 2);
  assert.ok(days.includes('value="09:00"'));
  assert.ok(days.includes("= 40 h a week"));
  assert.match(renderWorkQuestion(3, WORK, "", "onb"), /value="evening"[^>]*checked/);
});

test("renderWorkQuestion screen 3 with hours_vary", () => {
  const html = renderWorkQuestion(2, { ...WORK, schedule: null, hours_vary: true }, 16, "onb");
  assert.match(html, /name="work-varies"[^>]*checked/);
  assert.match(html, /name="work-hours"[^>]*value="16"/);
  assert.ok(!/class="work-varies-panel"[^>]*hidden/.test(html));
});

test("renderWorkQuestion screen 3 hides the hours panel unless it varies", () => {
  assert.match(renderWorkQuestion(2, WORK, "", "onb"), /class="work-varies-panel"[^>]*hidden/);
});

test("renderWorkQuestion escapes role and goal", () => {
  const html = renderWorkQuestion(1, { ...WORK, role: EVIL }, "", "onb")
    + renderWorkQuestion(4, { ...WORK, goal: EVIL }, "", "onb");
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("renderWorkQuestion uses the prefix in ids", () => {
  for (let i = 0; i < WORK_QUESTIONS.length; i++) {
    const a = renderWorkQuestion(i, WORK, 16, "onb");
    const b = renderWorkQuestion(i, WORK, 16, "set");
    const idsA = [...a.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const idsB = [...b.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(idsA.length > 0);
    assert.ok(idsA.every((id) => !idsB.includes(id)));
    for (const id of idsA) {
      assert.ok(a.includes(`for="${id}"`) || a.includes(`aria-labelledby="${id}"`) || a.includes(`aria-describedby="${id}"`), `no label for ${id}`);
    }
  }
});

test("renderWorkQuestion hides the legend when asked", () => {
  assert.ok(renderWorkQuestion(0, WORK, "", "onb", { hideLegend: true }).includes('<legend class="visually-hidden">'));
  assert.ok(!renderWorkQuestion(0, WORK, "", "onb").includes("visually-hidden"));
  assert.ok(renderWorkQuestion(3, WORK, "", "onb").includes(WORK_QUESTIONS[3]));
});

test("weekHoursText", () => {
  assert.strictEqual(weekHoursText(5, "09:00", "17:00"), "= 40 h a week");
  assert.strictEqual(weekHoursText(1, "22:00", "06:00"), "= 8 h a week");
  assert.strictEqual(weekHoursText(0, "09:00", "17:00"), "");
  assert.strictEqual(weekHoursText(5, "", "17:00"), "");
  assert.strictEqual(weekHoursText(5, "09:00", "09:00"), "");
});

test("renderAreaCard shows the Work line", () => {
  const html = renderAreaCard(card({ id: "work", label: "Work", goal: { text: "Software developer · Goal: Fix 3 bugs" } }));
  assert.ok(html.includes("Software developer · Goal: Fix 3 bugs"));
  assert.match(html, /aria-label="[^"]*, Software developer · Goal: Fix 3 bugs"/);
});

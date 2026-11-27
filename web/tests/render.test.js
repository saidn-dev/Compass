// Tests for render.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  escapeHtml, renderBrief, renderScoreChip, renderToday, baselineLine, renderOnboarding,
  renderHabitGrid, renderGoals, renderTasks,
  renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
  renderStudyGoals, studyDateHint, renderStudyGoalList, WORK_QUESTIONS, renderWorkQuestion, weekHoursText,
  renderNav, dayLabel, renderModulePage, renderModuleEdit,
  renderCheckIn, renderCarryOver, renderInsights, renderFocusReport, renderShield,
  renderStartingPoint, renderProjection, renderFirstSession,
  durationText, focusBreakdown, renderSessionList, renderFocusPanel, renderTaskPopover, renderFocusSummary, timerLine,
} from "../js/render.js";
import { IDLE, startSession, pause, tick } from "../js/timer.js";

const EVIL = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";

const card = (over = {}) => ({
  id: "sleep", label: "Sleep", unit: "h", value: 6.4, target: 7.5, mode: "up",
  progress: 85.3, trend: "down", series: [], ...over,
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
    renderScoreChip(card({ label: EVIL })),
    renderOnboarding([{ ...AREAS[0], label: EVIL }], []),
  ].join("");
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("&lt;script&gt;"));
});

// --- area card ---


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
  assert.ok(html.includes("leave it blank if there isn't one."));
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
  const html = renderStudyGoals([{ name: "A", date: null }, { name: "B", date: "2026-12-12" }], 12, "set", null, true);
  const ids = [...html.matchAll(/<(?:input|textarea) id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`), `no label for ${id}`);
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


// --- nav and module pages ---

const NAV_AREAS = [
  { id: "sleep", label: "Sleep" }, { id: "study", label: "Study" }, { id: "work", label: "Work" },
];
const DATES = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];
const TODAY = "2026-11-12";
const DAY = { sleep_hours: null, bedtime: null, wake_time: null, study_hours: null, work_hours: null };
const SETTINGS = {
  modules: ["sleep", "study", "work"], targets: [], sleep_schedule: null, study_goals: [],
  work: { kind: null, role: null, schedule: null, hours_vary: false, focus: null, goal: null, derailers: [] },
};
const entry = (over = {}) => ({
  id: "sleep", label: "Sleep", unit: "h", value: 6.8, target: 7.5, mode: "up", reason: "Mostly logging: 4 of 7 days",
  period: "average a night", series: [7.5, 8, null, 6, 6.5, 0, null],
  details: { title: "Your goal", lines: ["7.5 h a night"] },
  score: 91, score_label: "Optimal", headline: "Right on course", daily_target: 7.5,
  contributors: [
    { label: "Hours", text: "6.8 h average a night", score: 91, level: "Optimal" },
    { label: "Logging", text: "5 of 7 days", score: 71, level: "Good" },
  ], ...over,
});

test("renderNav lists Home, the modules that are on, then Settings", () => {
  const html = renderNav(NAV_AREAS, ["work", "sleep"], "sleep");
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(hrefs, ["#/", "#/sleep", "#/work", "#/focus", "#/insights", "#/settings"]);
  assert.ok(!html.includes("Study"));
  assert.strictEqual(html.match(/aria-current="page"/g).length, 1);
  assert.match(html, /href="#\/sleep"[^>]*aria-current="page"/);
  assert.ok(html.includes("Modules"));
});

test("renderNav without modules has no Modules label", () => {
  assert.ok(!renderNav(NAV_AREAS, [], "home").includes("Modules"));
});

test("dayLabel", () => {
  assert.strictEqual(dayLabel("2026-11-06", "2026-11-12"), "Fri 6");
  assert.strictEqual(dayLabel("2026-11-12", "2026-11-12"), "Today");
  assert.strictEqual(dayLabel("2026-11-12", "2026-11-13"), "Thu 12");
});

test("module page: log fields per module", () => {
  const goal = renderModulePage(entry(), DATES, TODAY, { ...DAY, sleep_hours: 7 }, SETTINGS);
  assert.ok(goal.includes('name="sleep_hours"') && goal.includes('value="7"'));
  assert.ok(goal.includes("Log last night"));
  const sched = renderModulePage(entry(), DATES, TODAY, { ...DAY, bedtime: "23:10", wake_time: "06:40" },
    { ...SETTINGS, sleep_schedule: { bedtime: "22:30", wake_time: "06:00" } });
  assert.ok(sched.includes('name="bedtime"') && sched.includes('name="wake_time"'));
  assert.ok(!sched.includes('name="sleep_hours"'));
  assert.ok(sched.includes("= 7.5 h a night"));
  assert.ok(sched.includes('data-stamp="bedtime"') && sched.includes('data-stamp="wake_time"'));
  assert.ok(!goal.includes("data-stamp"));
  const work = renderModulePage(entry({ id: "work", label: "Work", period: "this week" }), DATES, TODAY, DAY,
    { ...SETTINGS, work: { ...SETTINGS.work, kind: "job_hunting" } });
  assert.ok(work.includes('name="work_hours"') && work.includes("Job search") && work.includes("Log today"));
});

test("module page: a blank log field stays blank, never 0", () => {
  const html = renderModulePage(entry(), DATES, TODAY, { ...DAY, sleep_hours: null }, SETTINGS);
  assert.match(html, /name="sleep_hours"[^>]*value=""/);
});

test("module page: details lines are escaped and the Edit button names the module", () => {
  const html = renderModulePage(entry({ details: { title: "Your goals", lines: [IMG] } }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Your goals"));
  assert.match(html, /id="module-edit"[^>]*>Edit sleep</);
});

test("renderModuleEdit uses each module's form with the mod prefix", () => {
  const sleep = renderModuleEdit("sleep", SETTINGS, null);
  assert.ok(sleep.includes('id="mod-sleep-mode-goal"') && !sleep.includes("Let's work it out"));
  const study = renderModuleEdit("study", { ...SETTINGS, study_goals: [{ name: "Exam", date: null }] }, 12);
  assert.ok(study.includes('id="module-study"') && study.includes('id="mod-study-name-0"') && study.includes('value="12"'));
  const work = renderModuleEdit("work", SETTINGS, 16);
  assert.strictEqual(work.match(/class="work-question"/g).length, 6);
  for (const html of [sleep, study, work]) {
    assert.ok(html.includes('id="module-edit-form"') && html.includes('id="module-edit-error"') && html.includes('id="module-edit-cancel"'));
  }
});

test("renderModuleEdit keeps the panel's heading, so the panel keeps its name", () => {
  const html = renderModuleEdit("sleep", SETTINGS, null, "Your <schedule>");
  assert.ok(html.startsWith('<h2 id="module-details-title">Your &lt;schedule&gt;</h2>'));
  assert.ok(!renderModuleEdit("sleep", SETTINGS, null).includes("<h2"));
});

// --- scores: chips, the hero, bars ---

test("module page hero: the week's value, headline, level with its reason, and target", () => {
  const html = renderModulePage(entry({ trend: "down" }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes('<span class="hero-number">6.8</span>'));
  assert.ok(html.includes("Right on course"));
  assert.ok(html.includes('<p class="hero-status"><span class="status">Optimal</span>'));
  assert.ok(!html.includes("hero-reason"));
  assert.ok(html.includes("average a night"));
  assert.ok(html.includes("Target 7.5 h"));
  assert.ok(html.includes("Score 91"));
  assert.match(html, /<span class="trend" data-trend="down">Trending down<\/span><\/p>/);
  assert.ok(html.includes('class="ring-pills"'));
  assert.match(html, /stroke-dasharray="91 100"/);
});

test("module page hero: a screen reader hears the module's name, not just the period", () => {
  const html = renderModulePage(entry({ label: "Sleep" }), DATES, TODAY, DAY, SETTINGS);
  assert.match(html, /<section class="hero"[^>]* aria-label="Sleep this week">/);
  assert.ok(html.includes('<p class="hero-kicker">average a night</p>'));
});

test("module page hero with no data: a dash, no score arc, never 0", () => {
  const html = renderModulePage(entry({ value: null, reason: null, score: null, score_label: "No data", headline: "No bearings yet" }),
    DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes('<span class="hero-number">-</span>'));
  assert.ok(html.includes("No bearings yet"));
  assert.match(html, /<section class="hero" data-level="no_data"/);
  assert.ok(!html.includes("hero-status"));
  assert.match(html, /stroke-dasharray="0 100"/);
  assert.ok(!html.includes("Score "));
});

test("module page week bars: gaps read 'not logged' and a real 0 reads '0 h'", () => {
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.strictEqual(html.match(/class="week-bar"/g).length, 7);
  assert.strictEqual(html.match(/not logged/g).length, 2);
  assert.ok(html.includes("Fri 6: 7.5 h"));
  assert.ok(html.includes("Wed 11: 0 h"));
  assert.ok(html.includes("Today: not logged"));
  assert.strictEqual(html.match(/data-gap/g).length, 2);
  assert.strictEqual(html.match(/data-today/g).length, 1);
});

test("module page week bars are sized against the biggest of the values and the daily target", () => {
  // biggest value 8, daily target 7.5 -> the 8 bar is 100%, the 6 bar 75%, the target line at 93.8%
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("--height: 100%"));
  assert.ok(html.includes("--height: 75%"));
  assert.ok(html.includes("--target: 93.8%"));
});

test("module page contributors: label, text, level and a meter", () => {
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("Contributors"));
  assert.ok(html.includes("6.8 h average a night"));
  assert.ok(html.includes("--value: 91%"));
  assert.ok(html.includes("--value: 71%"));
  assert.ok(html.includes('data-level="good"'));
});

test("module page contributors: no score draws an empty meter and escapes text", () => {
  const html = renderModulePage(entry({ contributors: [{ label: "Hours", text: IMG, score: null, level: "No data" }] }),
    DATES, TODAY, DAY, SETTINGS);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("--value: 0%"));
  assert.ok(html.includes('data-level="no_data"'));
});

test("score chip links to the module's page and reads as one sentence", () => {
  const html = renderScoreChip(entry());
  assert.match(html, /^<a class="score-chip" href="#\/sleep" data-level="optimal"/);
  assert.ok(html.includes('aria-label="Sleep: score 91, Optimal. 6.8 h, Target 7.5 h"'));
  assert.ok(html.includes('<span class="score-chip-number">91</span>'));
  assert.ok(html.includes('<span class="score-chip-label">Sleep</span>'));
  assert.match(html, /stroke-dasharray="91 100"/);
});

test("score chip with no data shows a dash, not 0", () => {
  const html = renderScoreChip(entry({ value: null, status: "No data", score: null, score_label: "No data" }));
  assert.ok(html.includes('<span class="score-chip-number">-</span>'));
  assert.ok(html.includes('aria-label="Sleep: no data, Target 7.5 h"'));
  assert.match(html, /stroke-dasharray="0 100"/);
  assert.ok(html.includes('data-level="no_data"'));
});

test("score chip says Limit for a stay-under target", () => {
  const html = renderScoreChip(entry({ id: "work", label: "Work", value: 44, target: 40, mode: "limit", score: 90 }));
  assert.ok(html.includes("Limit 40 h"));
});

test("renderToday: the overall score with its headline", () => {
  const html = renderToday({ value: 90, label: "Optimal", headline: "Right on course" });
  assert.ok(html.includes('<span class="hero-number">90</span>'));
  assert.ok(html.includes("Compass score"));
  assert.ok(html.includes("Right on course"));
  assert.match(html, /stroke-dasharray="90 100"/);
});

test("renderToday with nothing logged shows a dash", () => {
  const html = renderToday({ value: null, label: "No data", headline: "No bearings yet" });
  assert.ok(html.includes('<span class="hero-number">-</span>'));
  assert.ok(html.includes("No bearings yet"));
  assert.match(html, /stroke-dasharray="0 100"/);
});

test("renderNav gives every link an icon hidden from screen readers", () => {
  const html = renderNav(NAV_AREAS, ["sleep", "study", "work"], "home");
  assert.strictEqual(html.match(/<svg class="nav-icon" aria-hidden="true"/g).length, 7);
});

// --- check-in, carry-over, history, insights ---

const TAGS = [{ id: "caffeine", label: "Caffeine late" }, { id: "exam", label: "Exam or deadline" }];

test("check-in: mood 1 to 5 with the saved one ticked, tags pressed, rest ticked", () => {
  const html = renderCheckIn({ mood: 4, tags: ["exam"], rest: true }, TAGS);
  assert.strictEqual(html.match(/type="radio" name="mood"/g).length, 5);
  assert.match(html, /name="mood" value="4" checked/);
  assert.ok(!/name="mood" value="3" checked/.test(html));
  assert.match(html, /data-tag="exam" aria-pressed="true"/);
  assert.match(html, /data-tag="caffeine" aria-pressed="false"/);
  assert.match(html, /id="rest-day"[^>]* checked/);
  assert.ok(html.includes("data-clear-mood"));
});

test("check-in with nothing saved: no mood ticked, no Clear, rest unticked", () => {
  const html = renderCheckIn({ mood: null, tags: [], rest: false }, TAGS);
  assert.ok(!html.includes(" checked"));
  assert.ok(!html.includes("data-clear-mood"));
  assert.ok(!html.includes('aria-pressed="true"'));
});

test("carry-over: one button per unfinished task, escaped; nothing when there are none", () => {
  const html = renderCarryOver([{ text: "Call the bank", area: "work" }, { text: IMG }]);
  assert.strictEqual(html.match(/data-carry=/g).length, 2);
  assert.ok(html.includes("+ Call the bank") && html.includes("&lt;img"));
  assert.ok(html.includes("From yesterday"));
  assert.ok(!html.includes("<img"));
  assert.strictEqual(renderCarryOver([]), "");
});

test("module page: tonight's bedtime, rest days and 12 weeks of history", () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1} Sep`, value: i === 0 ? null : i }));
  const html = renderModulePage(entry({ guidance: "Tonight: aim to be in bed by 22:30.", rest_days: 2, history, weekly_target: 7.5 }),
    DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("Tonight: aim to be in bed by 22:30."));
  assert.ok(html.includes("2 rest days"));
  assert.ok(html.includes('role="tablist"') && html.includes("Last </span>12 weeks</button>"));
  assert.strictEqual(html.match(/class="week-bar history-bar"/g).length, 12);
  assert.ok(html.includes("Week of 1 Sep: not logged"));
  assert.ok(html.includes("Week of 12 Sep: 11 h"));
  assert.strictEqual(html.match(/class="week-bar"/g).length, 7);
});

test("module page without the extras shows none of them", () => {
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.ok(!html.includes("12 weeks"));
  assert.ok(!html.includes("rest day"));
  assert.ok(!html.includes("hero-note"));
  assert.ok(renderModulePage(entry({ rest_days: 1 }), DATES, TODAY, DAY, SETTINGS).includes("1 rest day this week<"));
});

const INSIGHTS = {
  date: "2026-11-13",
  review: {
    range: "7 Nov to 13 Nov",
    score: { value: 89, previous: 83, label: "Good", headline: "Close to course", text: "Up 6 from the week before." },
    modules: [
      { id: "sleep", label: "Sleep", value_text: "7.4 h average a night", change_text: "Up from 6 h.", score: 92, score_label: "Good", previous_score: 80, best: "Best day: Tuesday (8.5 h)." },
      { id: "study", label: "Study", value_text: "Nothing logged", change_text: "", score: null, score_label: "No data", previous_score: null, best: null },
    ],
    extras: ["Habits: 50% done, up from 0%."],
    change: "One thing to change: Set a wind-down alarm 30 minutes before bed tonight.",
  },
  patterns: [{ text: "On days tagged Caffeine late you slept 6 h on average, against 8 h on other days.", detail: "3 days against 3, from the last 4 weeks." }],
  streaks: [{ label: "Logging", days: 3, best: 5, text: "3 days running" }, { label: IMG, days: 0, best: 0, text: "No streak yet" }],
};

test("insights: the weekly review", () => {
  const html = renderInsights(INSIGHTS);
  assert.ok(html.includes("Weekly review"));
  assert.ok(html.includes("<span>7 Nov to 13 Nov</span>"));
  assert.ok(html.includes('<span class="hero-number">89</span>'));
  assert.ok(html.includes("Close to course"));
  assert.ok(html.includes("Up 6 from the week before."));
  assert.match(html, /href="#\/sleep"/);
  assert.ok(html.includes("7.4 h average a night"));
  assert.ok(html.includes("Best day: Tuesday (8.5 h)."));
  assert.ok(html.includes("Nothing logged"));
  assert.ok(html.includes("Habits: 50% done, up from 0%."));
  assert.ok(html.includes("One thing to change: Set a wind-down alarm"));
  assert.match(html, /class="review-row" data-level="good"/);
  assert.match(html, /class="review-row" data-level="no_data"/);
});

test("insights: patterns and streaks, escaped", () => {
  const html = renderInsights(INSIGHTS);
  assert.ok(html.includes("On days tagged Caffeine late you slept 6 h"));
  assert.ok(html.includes("3 days against 3, from the last 4 weeks."));
  assert.ok(html.includes("3 days running"));
  assert.ok(html.includes("Best: 5"));
  assert.ok(!html.includes("<img"));
});

test("insights with nothing yet says what is needed", () => {
  const html = renderInsights({ ...INSIGHTS, patterns: [],
    review: { ...INSIGHTS.review, score: { value: null, previous: null, label: "No data", headline: "No bearings yet", text: "" }, extras: [], change: null } });
  assert.ok(html.includes('<span class="hero-number">-</span>'));
  assert.ok(html.includes("No patterns yet"));
  assert.ok(html.includes("3 days"));
});

// --- focus sessions and the timer ---

const NOW = new Date(2026, 10, 19, 14, 0).getTime();
const SESSIONS = [
  { id: "a1", area: "study", task: EVIL, minutes: 25, ended_at: "10:25" },
  { id: "b2", area: "study", task: null, minutes: 25, ended_at: "11:00" },
  { id: "c3", area: "work", task: "Invoices", minutes: 50, ended_at: "12:00" },
];
const TASKS = [{ text: IMG, done: false }, { text: "Done already", done: true }];

test("durationText", () => {
  assert.strictEqual(durationText(25), "25 min");
  assert.strictEqual(durationText(60), "1 h");
  assert.strictEqual(durationText(110), "1 h 50 min");
});

test("focusBreakdown adds typed-in hours and sessions; nothing without sessions", () => {
  assert.strictEqual(focusBreakdown({ study_hours: 1, sessions: SESSIONS }, "study"), "1 h logged + 2 sessions (50 min) = 1 h 50 min");
  assert.strictEqual(focusBreakdown({ study_hours: null, sessions: SESSIONS }, "study"), "2 sessions = 50 min");
  assert.strictEqual(focusBreakdown({ work_hours: 0.5, sessions: SESSIONS }, "work"), "0.5 h logged + 1 session (50 min) = 1 h 20 min");
  assert.strictEqual(focusBreakdown({ study_hours: 2, sessions: [] }, "study"), "");
});

test("session list: this module's sessions, task text escaped, a named Remove button each", () => {
  const html = renderSessionList(SESSIONS, "study");
  assert.strictEqual((html.match(/data-session-remove=/g) || []).length, 2);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("No task"));
  assert.ok(html.includes('aria-label="Remove the 25 min session that ended at 10:25"'));
  assert.ok(renderSessionList([], "work").includes("No sessions yet today."));
});

test("module pages keep the LCD focus panel", () => {
  const running = startSession({ area: "study", task: null, minutes: 25 }, NOW);
  assert.ok(renderFocusPanel("study", running, [], NOW).includes("focus-lcd"));
});

test("focus panel when idle: lengths, today's unfinished tasks (escaped) and Start", () => {
  const html = renderFocusPanel("study", IDLE, TASKS, NOW);
  assert.match(html, /id="focus-own" name="focus-own" value="25"/);
  assert.match(html, /name="duration-mins"[^>]*value="25"/);
  assert.ok(!html.includes("duration-hours"));
  assert.match(html, /data-duration-toggle aria-expanded="false"/);
  assert.ok(html.includes('data-task-pick="" aria-pressed="true"'));
  assert.ok(html.includes('id="focus-task" name="task" value=""'));
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("Done already"));
  assert.ok(html.includes(">Start<"));
});

test("focus panel while a session runs: the ring, the time, Pause, Finish early and Reset", () => {
  const running = startSession({ area: "study", task: "Essay", minutes: 25 }, NOW);
  const html = renderFocusPanel("study", running, TASKS, NOW + 10 * 60_000);
  assert.ok(html.includes('<span class="lcd-digits" data-timer-text role="timer">15:00</span>'));
  assert.ok(html.includes('stroke-dasharray="60 100"'));
  assert.ok(html.includes("Session 1 of 4 · Essay"));
  for (const action of ["pause", "finish", "reset"]) assert.ok(html.includes(`data-focus="${action}"`), action);
  const paused = renderFocusPanel("study", pause(running, NOW + 60_000), TASKS, NOW + 120_000);
  assert.ok(paused.includes('data-focus="resume"') && paused.includes("· paused"));
});

test("focus panel in a break offers Skip break and Stop", () => {
  // A tick just before the end, as the page makes once a second, then the end itself.
  const near = tick(startSession({ area: "work", task: null, minutes: 15 }, NOW), NOW + 15 * 60_000 - 1000).state;
  const { state } = tick(near, NOW + 15 * 60_000);
  const html = renderFocusPanel("work", state, [], NOW + 15 * 60_000);
  assert.ok(html.includes("Break · then session 2 of 4"));
  assert.ok(html.includes('data-focus="skip"') && html.includes('data-focus="stop"'));
});

test("focus panel after a round and after an away session", () => {
  const done = { phase: "done", area: "study", task: IMG, minutes: 50 };
  const html = renderFocusPanel("study", done, TASKS, NOW);
  assert.ok(html.includes("Round done: 4 sessions."));
  assert.match(html, /id="focus-own" name="focus-own" value="50"/);
  const long = renderFocusPanel("study", { ...done, minutes: 150 }, TASKS, NOW);
  assert.match(long, /name="duration-mins"[^>]*value="150"/);
  assert.ok(html.includes("selected") && html.includes("Start another round"));
  const away = { phase: "away", area: "study", task: null, minutes: 25,
    pending: { date: "2026-11-19", area: "study", task: null, minutes: 25, ended_at: "14:25" } };
  const asked = renderFocusPanel("study", away, TASKS, NOW);
  assert.ok(asked.includes("Your 25 min session ended at 14:25 while Compass wasn't open. Save it?"));
  assert.ok(asked.includes('data-focus="keep"') && asked.includes('data-focus="drop"'));
});

test("another module's running timer shows as one linked line, with no controls", () => {
  const running = startSession({ area: "study", task: null, minutes: 25 }, NOW);
  const html = renderFocusPanel("work", running, [], NOW + 60_000);
  assert.ok(html.includes('<a href="#/study">Study session 1 of 4</a>'));
  assert.ok(html.includes("24:00"));
  assert.ok(!html.includes("data-focus="));
  assert.strictEqual(timerLine(IDLE, NOW), "");
});

test("module page: Study gets the focus timer, its sessions and the breakdown; Sleep doesn't", () => {
  const study = renderModulePage(entry({ id: "study", label: "Study", period: "this week" }), DATES, TODAY,
    { ...DAY, study_hours: 1, sessions: SESSIONS, tasks: TASKS }, SETTINGS);
  assert.ok(study.includes('id="focus-timer"') && study.includes('id="focus-form"'));
  assert.ok(study.includes("1 h logged + 2 sessions (50 min) = 1 h 50 min"));
  const sleep = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.ok(!sleep.includes("focus-timer") && !sleep.includes("focus-breakdown"));
});

test("Home focus summary: today's sessions per module, and a running timer", () => {
  const focus = { today: { count: 3, minutes: 100, study: 50, work: 50 }, week: { count: 3, minutes: 100 } };
  assert.ok(renderFocusSummary(focus).includes("Focus sessions today: 3, 1 h 40 min (Study 50 min, Work 50 min)."));
  const none = { today: { count: 0, minutes: 0, study: 0, work: 0 }, week: { count: 0, minutes: 0 } };
  assert.ok(renderFocusSummary(none).includes("No focus sessions yet today."));
  const running = startSession({ area: "work", task: null, minutes: 50 }, NOW);
  assert.ok(renderFocusSummary(none, running, NOW).includes('<a href="#/focus">Work session 1 of 4</a>'));
});

// --- progress words: levels, the top reason ---

test("Home's hero shows the level and the top reason next to the gauge", () => {
  const html = renderToday({ value: 64, label: "Fair", headline: "Drifting a little", reason: `Mostly Study: <4> of 10 h` });
  assert.match(html, /^<section class="hero" data-level="fair"/);
  assert.ok(html.includes('<span class="status">Fair</span><span class="hero-reason">Mostly Study: &lt;4&gt; of 10 h</span>'));
});

test("Home's hero with everything at the top shows the level without a reason", () => {
  const html = renderToday({ value: 96, label: "Optimal", headline: "Right on course", reason: null });
  assert.ok(html.includes('<p class="hero-status"><span class="status">Optimal</span></p>'));
});

test("the first two weeks read 'Learning your rhythm', then your usual range", () => {
  assert.strictEqual(baselineLine("Learning your rhythm · day 4 of 14", null),
    '<p class="hero-usual" data-place="learning">Learning your rhythm · day 4 of 14</p>');
  const usual = { place: "below", low: 6.5, high: 7.4, text: "Last 14 days: 6 h a night · your usual 6.5 to 7.4 h · Below your usual ▼" };
  assert.ok(baselineLine(null, usual).includes('data-place="below">Last 14 days: 6 h a night'));
  assert.strictEqual(baselineLine(null, null), "");
});

test("module page shades your usual range on the 12-week chart", () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ label: `W${i}`, value: 7 }));
  const usual = { place: "within", low: 6.5, high: 7.5, text: "Last 14 days: 7 h a night · your usual 6.5 to 7.5 h · Within your usual" };
  const html = renderModulePage(entry({ history, weekly_target: 7.5, usual }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("data-usual"));
  assert.ok(html.includes("--usual-low: 86.7%; --usual-high: 100%"));
  assert.ok(html.includes("Shaded: your usual range, 6.5 to 7.5 h a night"));
  // The chart line keeps the numbers; the hero gives the one judgement.
  assert.ok(html.includes("Last 14 days: 7 h a night · your usual 6.5 to 7.5 h<") && !html.includes("Within your usual"));
});

test("the Focus Report is locked for a week, then reads as plain lines", () => {
  assert.ok(renderFocusReport({ locked: true, text: "Your first Focus Report unlocks on Tue 24 Nov · day 3 of 7." })
    .includes('<p class="empty focus-report-locked">Your first Focus Report unlocks on Tue 24 Nov · day 3 of 7.</p>'));
  const html = renderFocusReport({ locked: false, lines: ["This week: 8 h of focus.", "Since you started: <5 h> reclaimed."] });
  assert.ok(html.includes("<li>This week: 8 h of focus.</li><li>Since you started: &lt;5 h&gt; reclaimed.</li>"));
  assert.strictEqual(renderFocusReport(null), "");
});

test("pausing streaks: a form, or the active pause with a way to end it", () => {
  const form = renderShield(null, "2026-11-19");
  assert.ok(form.includes('id="shield-form"') && form.includes('min="2026-11-19"'));
  assert.ok(form.includes('<option value="exam">Exam period</option>'));
  const active = renderShield({ text: "Holiday: streaks paused until 2 Dec." }, "2026-11-19");
  assert.ok(active.includes("Holiday: streaks paused until 2 Dec.") && active.includes("data-shield-end"));
});

test("streaks show their state: lit, flicker, fade or out", () => {
  const data = {
    date: "2026-11-19", shield: null, focus_report: null, patterns: [],
    review: { range: "", score: { value: null, label: "No data", headline: "", text: "" }, modules: [], extras: [], change: null },
    streaks: [{ label: "Logging", days: 4, best: 6, state: "fade", text: "Fading · do it today to revive 4 days" }],
  };
  const html = renderInsights(data);
  assert.ok(html.includes('<li class="streak" data-state="fade">'));
  assert.ok(html.includes("Fading · do it today to revive 4 days"));
  assert.ok(html.includes('id="shield-form"'));
});

test("the Study timer offers study goals as tasks", () => {
  const html = renderFocusPanel("study", IDLE, [{ text: "Read notes", done: false }], 0, "", ["Revise <ch 5>"]);
  assert.ok(html.includes('task-pop-heading">Today</p>') && html.includes('data-task-pick="Read notes"'));
  assert.ok(html.includes('task-pop-heading">Study goals</p>') && html.includes('data-task-pick="Revise &lt;ch 5&gt;"'));
  assert.ok(!renderFocusPanel("work", IDLE, [], 0, "", ["Revise"]).includes("Study goals"));
});

test("study goal rows have an optional hours field", () => {
  const html = renderStudyGoals([{ name: "Exam", date: "2026-12-01", hours: 20 }], 12, "onb");
  assert.ok(html.includes('id="onb-study-goal-hours-0" name="study-goal-hours"'));
  assert.ok(html.includes('value="20"'));
  assert.ok(renderStudyGoals([], 12, "onb").includes('name="study-goal-hours" type="number" inputmode="decimal" min="0" max="1000" step="any" value=""'));
});

test("starting point: one honest estimate per focus module", () => {
  const html = renderStartingPoint(["sleep", "study", "work"], { study_hours: 5, work_hours: null });
  assert.ok(html.includes("Honestly, how many hours do you study in a normal week right now?"));
  assert.ok(html.includes('id="onb-start-study" name="study_hours"') && html.includes('value="5"'));
  assert.ok(html.includes('id="onb-start-work" name="work_hours"'));
  assert.ok(!html.includes("sleep"));
});

test("the projection is labelled as an estimate and stays kind", () => {
  const targets = [{ area_id: "study", target: 12, mode: "up" }, { area_id: "work", target: 40, mode: "limit" }];
  const html = renderProjection({ study: 5, work: 50 }, targets);
  assert.ok(html.includes('<p class="projection-label">Estimate</p>'));
  assert.ok(html.includes("At about 5 h a week, that&#39;s about 260 h of study a year. Your target of 12 h a week adds about 360 h a year, the same as 9 full 40-hour weeks."));
  assert.ok(html.includes("Keeping to your limit of 40 h a week gives back about 520 h a year."));
  assert.ok(renderProjection({ study: 14 }, targets).includes("That already meets your target of 12 h a week"));
  assert.strictEqual(renderProjection({ study: null, work: null }, targets), "");
});

test("first session: pick the module only when there are two", () => {
  const both = renderFirstSession(["study", "work"]);
  assert.ok(both.includes('<legend>What for</legend>') && both.includes('value="work"'));
  assert.ok(both.includes('name="session-minutes" value="25" checked'));
  const one = renderFirstSession(["sleep", "work"]);
  assert.ok(one.includes('<input type="hidden" name="session-area" value="work">'));
  assert.ok(!one.includes("What for"));
});

test("a limit reads Great, Ok or Too much", () => {
  const html = renderModulePage(entry({ id: "work", label: "Work", mode: "limit", score: 70, score_label: "Too much",
    headline: "Well over your limit", reason: "Mostly hours: 52 of 40 h this week" }), DATES, TODAY, DAY, SETTINGS);
  assert.match(html, /<section class="hero" data-level="too_much"/);
  assert.ok(html.includes('<span class="status">Too much</span>'));
  assert.ok(html.includes("Limit 7.5 h"));
});


// --- Study page depth: dates in words, steps, session totals ---

test("renderStudyGoals shows the date as typed and what it was read as", () => {
  const html = renderStudyGoals([{ name: "Exam", dateText: "next monday" }], 12, "mod", "2026-11-20");
  assert.ok(html.includes('value="next monday"'));
  assert.ok(html.includes('type="text"'));
  assert.ok(html.includes("Mon 23 Nov 2026 · in 3 days"));
  assert.ok(!html.includes('name="study-steps"'), "steps only when asked for");
});

test("studyDateHint explains an unreadable date and stays quiet when blank", () => {
  assert.match(studyDateHint("soon", "2026-11-20"), /^Can't read that date/);
  assert.strictEqual(studyDateHint("", "2026-11-20"), "");
  assert.strictEqual(studyDateHint("5 dec", null), "");
});

test("renderStudyGoals draws a Steps box with saved steps, escaped", () => {
  const goals = [{ name: "Exam", date: null, steps: [{ text: "Paper 1", done: true }, { text: EVIL, done: false }] }];
  const html = renderStudyGoals(goals, 12, "mod", "2026-11-20", true);
  assert.ok(html.includes('name="study-steps"'));
  assert.ok(html.includes("Paper 1\n&lt;script&gt;"));
  assert.ok(!html.includes(EVIL));
});

test("renderStudyGoalList shows sessions, pace and tickable steps", () => {
  const html = renderStudyGoalList([{
    index: 0, name: EVIL, when: "in 12 days", sessions: "2 sessions · 1 h 15 min of 40 h",
    pace: "At this pace…", steps: [{ text: "Paper 1", done: true }, { text: "Paper 2", done: false }],
    steps_text: "1 of 2 steps done",
  }]);
  assert.ok(!html.includes(EVIL));
  assert.ok(html.includes("in 12 days · 1 of 2 steps done"));
  assert.ok(html.includes("2 sessions · 1 h 15 min of 40 h"));
  assert.ok(html.includes('id="study-step-0-0" data-goal="0" data-step="0" checked'));
  assert.ok(html.includes('data-step="1">'));
});

test("renderModulePage uses the goal list when the details carry goals", () => {
  const area = {
    id: "study", label: "Study", unit: "h", value: null, score: null, target: 10, mode: "up", period: "this week",
    series: [], history: [], contributors: [],
    details: { title: "Your goals", lines: ["Essay"], goals: [{
      index: 0, name: "Essay", when: null, sessions: "No sessions yet", pace: null, steps: [], steps_text: null }] },
  };
  const html = renderModulePage(area, [], "2026-11-20", { tasks: [], sessions: [] }, { study_goals: [] });
  assert.ok(html.includes('class="study-goal-list"'));
  assert.ok(html.includes("No sessions yet"));
});

test("tasks belong to a module: each popover lists only its own (and untagged older ones)", () => {
  const tasks = [{ text: "Read ch 5", done: false, area: "study" }, { text: "Client email", done: false, area: "work" },
    { text: "Old one", done: false }];
  const study = renderTaskPopover("focus-task", tasks, [], null, { area: "study" });
  assert.ok(study.includes('data-task-pick="Read ch 5"') && study.includes('data-task-pick="Old one"'));
  assert.ok(!study.includes("Client email"));
  const work = renderFocusPanel("work", IDLE, tasks, NOW, "", [], "timer", null, { area: "work" });
  assert.ok(work.includes('data-task-pick="Client email"') && !work.includes("Read ch 5"));
  assert.ok(!work.includes(">Habit<"), "module pages have no Habit tab");
  assert.ok(renderTaskPopover("focus-task", tasks, [], null, { area: "work" }).includes(">Habit<"));
});

test("with both modules on, Home tags each task with its module", () => {
  const tasks = [{ text: "Read ch 5", done: false, area: "study" }, { text: "Old one", done: false }];
  assert.ok(renderTasks(tasks, true, true).includes('<span class="task-area">Study</span>'));
  assert.strictEqual(renderTasks(tasks, true, true).match(/task-area/g).length, 1);
  assert.ok(!renderTasks(tasks, true).includes("task-area"));
});

test("sleep stamps: the row carries its state; merged, Going to bed is inert", async () => {
  const { renderSleepStamps } = await import("../js/render.js");
  assert.match(renderSleepStamps(), /data-state="none"/);
  assert.ok(!renderSleepStamps("bed").includes("inert"));
  const up = renderSleepStamps("up");
  assert.match(up, /data-state="up"/);
  assert.match(up, /data-stamp="bedtime" inert/);
  assert.ok(up.includes("Tap again to undo"));
});

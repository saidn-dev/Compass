// Tests for render.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  escapeHtml, renderBrief, renderScoreChip, renderToday, renderOnboarding,
  renderHabitGrid, renderGoals, renderTasks,
  renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
  renderStudyGoals, WORK_QUESTIONS, renderWorkQuestion, weekHoursText,
  renderNav, dayLabel, renderModulePage, renderModuleEdit,
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
  id: "sleep", label: "Sleep", unit: "h", value: 6.8, target: 7.5, mode: "up", status: "Behind",
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
  assert.deepStrictEqual(hrefs, ["#/", "#/sleep", "#/work", "#/settings"]);
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

// --- scores: chips, the hero, bars ---

test("module page hero: the week's value, headline, status and target", () => {
  const html = renderModulePage(entry({ trend: "down" }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes('<span class="hero-number">6.8</span>'));
  assert.ok(html.includes("Right on course"));
  assert.ok(html.includes('<span class="status">Behind</span>'));
  assert.ok(html.includes("average a night"));
  assert.ok(html.includes("Target 7.5 h"));
  assert.ok(html.includes("Score 91"));
  assert.match(html, /<p class="trend" data-trend="down">Trending down<\/p>/);
  assert.match(html, /stroke-dasharray="91 100"/);
});

test("module page hero with no data: a dash, no score arc, never 0", () => {
  const html = renderModulePage(entry({ value: null, status: "No data", score: null, score_label: "No data", headline: "No bearings yet" }),
    DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes('<span class="hero-number">-</span>'));
  assert.ok(html.includes("No bearings yet"));
  assert.ok(html.includes("No data"));
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
  assert.ok(html.includes('aria-label="Sleep: score 91, Optimal. 6.8 h, Target 7.5 h, Behind"'));
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
  assert.strictEqual(html.match(/<svg class="nav-icon" aria-hidden="true"/g).length, 5);
});

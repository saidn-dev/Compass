// Tests for the Focus page renderers, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  renderFocusAreaPicker, renderFocusCard, renderFocusLog, renderFocusPage,
  renderFocusPanel, renderFocusSummary, renderFocusTotals, startedAt, renderTaskPopover, recentTasks,
  renderFocusTimeline, renderFocusHours, renderFocusYear, renderRecordPop, renderTasks, renderFocusStatsPage,
  timerButtons, renderFocusGoal, renderTaskEstimate,
} from "../js/render.js";
import { IDLE, startSession, startWatch, tick } from "../js/timer.js";

const EVIL = "<script>alert(1)</script>";
const TODAY = "2026-11-19";
const NOW = new Date(2026, 10, 19, 14, 0).getTime();
const AREAS = [{ id: "study", label: "Study" }, { id: "work", label: "Work" }];
const TASKS = [{ text: "Read notes", done: false }];

const FOCUS = {
  summary: {
    today: { count: 2, minutes: 75, study: 50, work: 25 },
    week: { count: 5, minutes: 210, study: 130, work: 80 },
  },
  log: [
    { date: TODAY, minutes: 75, sessions: [
      { id: "a1", area: "study", task: EVIL, minutes: 50, ended_at: "10:25" },
      { id: "b2", area: "work", task: null, minutes: 25, ended_at: "12:00" },
    ] },
    { date: "2026-11-18", minutes: 50, sessions: [
      { id: "c3", area: "study", task: "Revise <ch 5>", minutes: 50, ended_at: "16:00" },
    ] },
  ],
  tasks: {
    "7d": [
      { area: "study", task: "Revise <ch 5>", minutes: 130, count: 3, goal: true },
      { area: "work", task: null, minutes: 80, count: 2, goal: false },
    ],
    "12w": [
      { area: "work", task: "Invoices", minutes: 300, count: 6, goal: false },
    ],
  },
  days: [
    { date: TODAY, study: 50, work: 25 },
    { date: "2026-11-18", study: 50, work: 0 },
    { date: "2026-11-17", study: 0, work: 80 },
    { date: "2026-11-16", study: 30, work: 0 },
    { date: "2026-11-15", study: 0, work: 0 },
    { date: "2026-11-14", study: 0, work: 0 },
    { date: "2026-11-13", study: 0, work: 0 },
  ],
  weeks: Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1} Sep`, study: i === 11 ? 130 : 0, work: i === 11 ? 80 : 0,
  })),
  sessions: [
    { date: TODAY, id: "a1", area: "study", task: EVIL, minutes: 50, ended_at: "10:25", note: null },
    { date: TODAY, id: "b2", area: "work", task: null, minutes: 25, ended_at: "12:00", note: null },
    { date: "2026-11-18", id: "c3", area: "study", task: "Revise <ch 5>", minutes: 50, ended_at: "16:00", note: null },
  ],
  year: [{ date: "2025-11-20", minutes: 0 }],
};

const pageOptions = { areas: AREAS, area: "study", goals: ["Revise <ch 5>"], mode: "timer", today: TODAY };

test("the area picker offers only the enabled modules and ticks the current one", () => {
  const html = renderFocusAreaPicker(AREAS, "study", "focus-area");
  assert.match(html, /name="focus-area" value="study" checked/);
  assert.match(html, /name="focus-area" value="work"/);
  assert.ok(html.includes("Focus area"));
  assert.ok(!renderFocusAreaPicker([{ id: "work", label: "Work" }], "work", "focus-area").includes("Study"));
});

test("the Focus panel has an area switch on both start forms when both modules are on", () => {
  const html = renderFocusPanel("study", IDLE, TASKS, NOW, "", [], "timer", AREAS);
  assert.match(html, /name="focus-area" value="study" checked/);
  assert.match(html, /name="watch-area" value="study" checked/);
  assert.ok(html.includes('<form id="focus-form" class="focus-form" data-area="study"'));
  assert.ok(html.includes('<form id="watch-form" class="focus-form" data-area="study"'));
});

test("the Focus panel controls the running area even when another module was picked", () => {
  const running = startSession({ area: "work", task: null, minutes: 25 }, NOW);
  const html = renderFocusPanel("study", running, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes('data-focus="pause"'));
  assert.ok(!html.includes('<a href="#/work">'));
  assert.ok(html.includes("Work session 1 of 4"));
});

test("Focus overview uses TickTick-style tiles split today and this week by area", () => {
  const html = renderFocusTotals(FOCUS);
  assert.ok(html.includes("Today's Pomo") && html.includes("Today's Focus"));
  assert.ok(html.includes("Week's Pomo") && html.includes("Week's Focus"));
  assert.ok(html.includes('focus-stat-value">2<') && html.includes('focus-stat-value">5<'));
  assert.ok(html.includes("1 h 15 min") && html.includes("3 h 30 min"));
  assert.ok(html.includes("Study 50 min") && html.includes("Work 25 min"));
});

test("Focus log groups sessions by day, escapes tasks and can remove any date", () => {
  const html = renderFocusLog(FOCUS, TODAY);
  assert.strictEqual((html.match(/data-session-remove=/g) || []).length, 3);
  assert.ok(html.includes('data-session-date="2026-11-18"'));
  assert.ok(html.includes("Wed 18"));
  assert.ok(html.includes(EVIL.replaceAll("<", "&lt;").replaceAll(">", "&gt;")));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("1 h 15 min"));
  assert.ok(renderFocusLog({ ...FOCUS, log: [] }, TODAY).includes("No focus sessions yet."));
});

test("Focus stats' charts stack Study and Work and name both in the screen-reader text", () => {
  const html = renderFocusStatsPage(FOCUS, TODAY);
  assert.ok(html.includes("Last 7 days") && html.includes("Last 12 weeks"));
  assert.ok(html.includes('class="week-bar-stack"'));
  assert.ok(html.includes("week-bar-fill-a") && html.includes("week-bar-fill-b"));
  assert.ok(html.includes("Study 50 min, Work 25 min"));
  assert.ok(html.includes("Week of 12 Sep: Study 2 h 10 min, Work 1 h 20 min"));
  assert.ok(html.includes("Study") && html.includes("Work"));
});

test("the Focus page holds the timer, the totals and the record, and leaves charts to Focus stats", () => {
  const html = renderFocusPage(FOCUS, IDLE, TASKS, NOW, "", pageOptions);
  assert.ok(!html.includes('data-tabs="focus-page"'));
  assert.ok(html.includes('id="focus-page-timer"') && html.includes('id="focus-page-totals"'));
  assert.ok(html.includes('id="focus-page-log"'));
  assert.ok(!html.includes('id="focus-page-tasks"') && !html.includes("week-bar-stack"));
  assert.ok(html.includes('name="focus-area"'));
  assert.ok(html.includes('class="focus-card"'));
  assert.ok(!html.includes("focus-lcd"));
});

test("the Focus card starts idle with mode tabs, area, task, lengths and one Start", () => {
  const html = renderFocusCard("study", IDLE, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes('class="focus-card"'));
  assert.ok(html.includes('data-tabs="focus-study"'));
  assert.ok(html.includes('aria-selected="true"') && html.includes("Stopwatch"));
  assert.match(html, /name="focus-area" value="study" checked/);
  assert.ok(html.includes('id="focus-task"') && html.includes('name="focus-minutes"'));
  assert.ok(html.includes('id="focus-form"'));
});

test("the Focus card's ring reading opens the minute wheel in its place", () => {
  const html = renderFocusCard("study", IDLE, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes('class="focus-card" data-state="idle" data-phase="idle" data-open="false"'));
  assert.match(html, /class="focus-card-trigger" data-focus-card-open\s+aria-expanded="false" aria-controls="focus-card-picker"/);
  assert.ok(html.includes('data-focus-length>25:00'));
  assert.ok(html.indexOf("focus-card-trigger") < html.indexOf('id="focus-card-picker"'));
  assert.ok(html.includes('class="focus-wheel-unit" aria-hidden="true">mins'));
  // The idle ring is not live: only a running countdown carries data-timer-ring.
  assert.ok(!html.includes("data-timer-ring"));
});

test("the Focus card's minute wheel offers every length and keeps the form hooks", () => {
  const html = renderFocusCard("study", IDLE, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes('class="focus-wheel"'));
  assert.match(html, /name="focus-minutes" value="1"/);
  assert.match(html, /name="focus-minutes" value="25" checked/);
  assert.match(html, /name="focus-minutes" value="180"/);
  assert.ok(html.includes('id="focus-own"'));
});

test("the Focus page has a header menu while the stats stay on screen", () => {
  const html = renderFocusPage(FOCUS, IDLE, TASKS, NOW, "", { areas: AREAS });
  assert.ok(html.includes('id="focus-more-button"') && html.includes('aria-haspopup="menu"'));
  assert.ok(html.includes("Focus statistics") && html.includes("Full-screen timer"));
  assert.ok(html.indexOf('id="focus-more-menu"') < html.indexOf('id="focus-page-totals"'));
});

test("each Focus mode has its own task popover above the ring", () => {
  const html = renderFocusCard("study", IDLE, TASKS, NOW, "", [], "stopwatch", AREAS);
  assert.ok(html.includes('aria-controls="focus-task-pop"') && html.includes('aria-controls="watch-task-pop"'));
  assert.ok(html.includes('<span class="visually-hidden">Task: </span>'));
  const watchPane = html.slice(html.indexOf('id="focus-pane-stopwatch"'));
  assert.ok(watchPane.indexOf('id="watch-task"') < watchPane.indexOf("focus-card-dial"));
  assert.ok(html.includes(">Pomo</button>") && html.includes(">Stopwatch</button>"));
});

test("the Focus page puts the timer pane beside a rail of totals and the record", () => {
  const html = renderFocusPage(FOCUS, IDLE, TASKS, NOW, "", { areas: AREAS });
  assert.ok(html.includes('class="focus-stage"') && html.includes('class="focus-rail"'));
  assert.ok(html.indexOf('id="focus-page-timer"') < html.indexOf('class="focus-rail"'));
  const rail = html.slice(html.indexOf('class="focus-rail"'));
  assert.ok(rail.includes('id="focus-page-totals"') && rail.includes('id="focus-page-log"'));
});

test("the Focus record shows each session's start and end time", () => {
  assert.equal(startedAt("15:38", 45), "14:53");
  assert.equal(startedAt("00:10", 25), "23:45");
  const html = renderFocusLog(FOCUS, "2026-11-22");
  assert.ok(html.includes("Focus record"));
  assert.match(html, /class="focus-record-time">\d\d:\d\d – \d\d:\d\d</);
});

test("the Focus card shows a running session from another area with its controls", () => {
  const running = startSession({ area: "work", task: null, minutes: 25 }, NOW);
  const html = renderFocusCard("study", running, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes("Work session 1 of 4"));
  assert.ok(html.includes('data-focus="pause"'));
  assert.ok(html.includes('data-timer-text') && html.includes('data-timer-ring'));
  assert.ok(!html.includes('id="focus-form"'));
});

test("the Focus card shows a stopwatch count without a countdown ring", () => {
  const watch = startWatch({ area: "study", task: "Read notes" }, NOW);
  const html = renderFocusCard("study", watch, TASKS, NOW + 60_000, "", [], "stopwatch", AREAS);
  assert.ok(html.includes("Time counted"));
  assert.ok(html.includes('data-focus="finish"'));
  assert.ok(!html.includes("lcd-timeline"));
});

test("the Focus card offers Save or Discard for a session missed while away", () => {
  const away = { ...startSession({ area: "study", task: null, minutes: 25 }, NOW), phase: "away",
    pending: { minutes: 25, ended_at: "14:25" } };
  const html = renderFocusCard("study", away, TASKS, NOW, "", [], "timer", AREAS);
  assert.ok(html.includes('data-focus="keep"') && html.includes('data-focus="drop"'));
});

test("Home's focus line links to the Focus page when one is available", () => {
  const focus = { today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 } };
  const running = startSession({ area: "work", task: null, minutes: 50 }, NOW);
  const html = renderFocusSummary(focus, running, NOW, true);
  assert.ok(html.includes('href="#/focus"'));
  assert.ok(!html.includes('href="#/work"'));
});


test("the running card shows the time as rolling digits and keeps plain text for screen readers", async () => {
  const { timeDigits } = await import("../js/render.js");
  assert.strictEqual(timeDigits("24:59"),
    ["2", "4", ":", "5", "9"].map((c) => `<span class="focus-digit"><span>${c}</span></span>`).join(""));
});


test("the task popover has Recent, Task and Habit tabs, search and the choice in a hidden input", () => {
  const html = renderTaskPopover("focus-task", TASKS, ["Revise <ch 5>"], "Read notes",
    { recent: ["Old <one>"], habits: ["Practice typing"] });
  assert.ok(html.includes('<input type="hidden" id="focus-task" name="task" value="Read notes">'));
  assert.ok(html.includes('id="focus-task-pop"') && html.includes('role="dialog"'));
  for (const tab of ["Recent", "Task", "Habit"]) assert.ok(html.includes(`>${tab}</button>`));
  assert.ok(html.includes('aria-selected="true" tabindex="0" data-tab="task"'));
  assert.ok(html.includes("data-task-search") && html.includes('data-task-pick=""'));
  assert.ok(html.includes("Old &lt;one&gt;") && html.includes("Practice typing") && html.includes("Study goals"));
  assert.ok(html.includes('data-task-pick="Read notes" aria-pressed="true"'));
});

test("Recent lists one area's session tasks, newest first and each once", () => {
  const log = [
    { date: "2026-11-22", sessions: [{ area: "study", task: "A" }, { area: "work", task: "W" }, { area: "study", task: "B" }] },
    { date: "2026-11-21", sessions: [{ area: "study", task: "A" }, { area: "study", task: null }, { area: "study", task: "C" }] },
  ];
  assert.deepStrictEqual(recentTasks(log, "study"), ["B", "A", "C"]);
  assert.deepStrictEqual(recentTasks(log, "work"), ["W"]);
  assert.deepStrictEqual(recentTasks(undefined, "study"), []);
});


test("the task popover offers to add what was searched for as a new task", () => {
  const html = renderTaskPopover("focus-task", TASKS, [], null);
  assert.ok(html.includes('placeholder="Search or add a task"'));
  assert.ok(html.includes("data-task-create hidden") && html.includes("data-task-create-name"));
  assert.ok(html.includes('data-task-pop-note role="status"'));
});


test("the Focus record has + Add and an Edit button per session, carrying its times and task", () => {
  const data = { log: [{ date: "2026-11-22", minutes: 45, sessions: [{ id: "a1", area: "study", task: "Read <it>", minutes: 45, ended_at: "10:30" }] }] };
  const html = renderFocusLog(data, "2026-11-22");
  assert.ok(html.includes("data-record-add"));
  assert.ok(html.includes('data-session-id="a1"') && html.includes('data-start="09:45"') && html.includes('data-end="10:30"'));
  assert.ok(html.includes('data-task="Read &lt;it&gt;"'));
  assert.ok(html.includes('aria-label="Edit the 45 min Study session from Today at 10:30"'));
});

test("the record dialog has the area, day, start, end and task", () => {
  const html = renderRecordPop([{ id: "study", label: "Study" }, { id: "work", label: "Work" }], "2026-11-22");
  for (const id of ["record-form", "record-date", "record-start", "record-end", "record-task", "record-error"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('name="record-area" value="work"') && html.includes('max="2026-11-22"'));
  assert.ok(renderRecordPop([{ id: "work", label: "Work" }], "2026-11-22").includes('type="hidden" name="record-area" value="work"'));
});

test("the timeline draws each session where it ran, and splits one over midnight", () => {
  const data = {
    days: [{ date: "2026-11-21" }, { date: "2026-11-22" }],
    log: [{ date: "2026-11-22", sessions: [{ area: "work", minutes: 60, ended_at: "13:00" }, { area: "study", minutes: 30, ended_at: "00:10" }] }],
  };
  const html = renderFocusTimeline(data, "2026-11-22");
  assert.match(html, /data-area="work"\s+style="left:50%;width:4\.17%"/);
  assert.equal((html.match(/data-area="study"/g) || []).length, 2);
  assert.ok(html.includes("Today: Work 12:00 to 13:00, Study 23:40 to 00:10"));
  assert.ok(html.includes("Sat 21: no sessions"));
});

test("most focused time names the busiest hour, and says so when there is nothing", () => {
  const hours = Array(24).fill(0);
  hours[10] = 90;
  hours[9] = 30;
  const html = renderFocusHours({ hours });
  assert.ok(html.includes("10:00–11:00") && html.includes("1 h 30 min over 12 weeks"));
  assert.equal((html.match(/class="hour-bar[ "]/g) || []).length, 24);
  assert.ok(renderFocusHours({ hours: Array(24).fill(0) }).includes("No sessions in the last 12 weeks."));
});

test("the year grid starts on Monday and shades days by length", () => {
  const year = [{ date: "2026-11-18", minutes: 0 }, { date: "2026-11-19", minutes: 45 }, { date: "2026-11-20", minutes: 150 }];
  const html = renderFocusYear({ year });
  assert.equal((html.match(/is-blank/g) || []).length, 2); // 18 Nov 2026 is a Wednesday
  assert.ok(html.includes('data-level="2" title="Thu 19 Nov: 45 min"'));
  assert.ok(html.includes('data-level="4" title="Fri 20 Nov: 2 h 30 min"'));
  assert.ok(html.includes("2 days with focus, 3 h 15 min in all."));
});

test("Home's open tasks get a Focus button when a focus module is on", () => {
  const tasks = [{ text: "A", done: false }, { text: "B", done: true }];
  assert.ok(!renderTasks(tasks).includes("data-focus-task"));
  const html = renderTasks(tasks, true);
  assert.ok(html.includes('data-focus-task="0"') && !html.includes('data-focus-task="1"'));
  assert.ok(html.includes('aria-label="Focus on A"'));
});

test("the Focus stats page has totals, the year, a 14-day timeline, the hours, the bars and time by task", () => {
  const year = [
    { date: "2026-10-31", minutes: 30 }, { date: "2026-11-01", minutes: 60 }, { date: "2026-11-02", minutes: 0 },
    { date: "2026-11-20", minutes: 25 }, { date: "2026-11-21", minutes: 50 }, { date: "2026-11-22", minutes: 0 },
  ];
  const data = {
    year, hours: Array(24).fill(0), log: [], days: [], weeks: [], tasks: { week: [], all: [] },
    summary: { today: { count: 0, minutes: 0 }, week: { count: 2, minutes: 75 } },
  };
  const html = renderFocusStatsPage(data, "2026-11-22");
  assert.ok(html.includes("This month (Nov)") && html.includes("2 h 15 min")); // 60 + 25 + 50
  assert.ok(html.includes("Longest streak") && html.includes(">2 days<") && html.includes("now 2 days"));
  assert.ok(html.includes("The last 14 days, midnight to midnight"));
  assert.equal((html.match(/class="timeline-row"/g) || []).length, 14);
  assert.ok(html.includes('class="year-months"') && html.includes(">Nov</span>"));
  assert.ok(html.includes("Last 12 weeks") && html.includes('id="stats-period"'));
});

// --- timer options on the page ---

// Ticks up to a time a second before it and then at it, as the page does (one long jump
// would read as the laptop sleeping).
const tickTo = (state, at) => tick(tick(state, at - 1000).state, at).state;

test("a break or session waiting for a press offers Start break / Start session", () => {
  const s = startSession({ area: "study", minutes: 25, options: { auto_break: false, auto_focus: false } }, NOW);
  const waitingBreak = tickTo({ ...s, lastTick: NOW + 25 * 60_000 - 2000 }, NOW + 25 * 60_000);
  assert.ok(timerButtons(waitingBreak).toggle.includes(">Start break</button>"));
  const html = renderFocusCard("study", waitingBreak, [], NOW + 25 * 60_000);
  assert.ok(html.includes("ready to start") && !html.includes("· paused"));
  const paused = { ...startSession({ area: "study", minutes: 25 }, NOW), endsAt: null, remaining: 60_000 };
  assert.ok(timerButtons(paused).toggle.includes(">Resume</button>"));
});

test("strict mode drops Pause, Finish early and Reset from a running session only", () => {
  const strict = startSession({ area: "study", minutes: 25, options: { strict: true } }, NOW);
  const { toggle, more } = timerButtons(strict);
  assert.strictEqual(toggle, "");
  assert.ok(more.includes("Strict mode") && !more.includes('data-focus="finish"') && !more.includes('data-focus="reset"'));
  const onBreak = tickTo({ ...strict, lastTick: NOW + 25 * 60_000 - 2000 }, NOW + 25 * 60_000);
  assert.ok(timerButtons(onBreak).more.includes('data-focus="skip"'));
  assert.ok(timerButtons(startSession({ area: "study", minutes: 25 }, NOW)).more.includes('data-focus="finish"'));
});

test("the round size in the timer's words follows the options", () => {
  const s = startSession({ area: "study", minutes: 25, options: { long_break_every: 3 } }, NOW);
  assert.match(renderFocusCard("study", s, [], NOW), /session 1 of 3/i);
});

// --- the daily goal, notes and pomo estimates ---

test("the daily goal shows today's minutes against it, and nothing without a goal", () => {
  assert.strictEqual(renderFocusGoal(50, 0), "");
  const half = renderFocusGoal(60, 120);
  assert.ok(half.includes("1 h of 2 h") && half.includes('aria-valuenow="50"') && half.includes("1 h to go"));
  assert.ok(renderFocusGoal(150, 120).includes("Goal reached for today.") && renderFocusGoal(150, 120).includes('aria-valuenow="100"'));
  assert.ok(renderFocusPage(FOCUS, IDLE, TASKS, NOW, "", { ...pageOptions, dailyGoal: 120 }).includes("1 h 15 min of 2 h"));
});

test("the record shows a session's note and carries it to the edit dialog", () => {
  const data = { ...FOCUS, log: [{ date: TODAY, minutes: 25, sessions: [
    { id: "n1", area: "study", task: "Essay", minutes: 25, ended_at: "10:00", note: "Outline <done>" },
  ] }] };
  const html = renderFocusLog(data, TODAY);
  assert.ok(html.includes('class="focus-record-note">Outline &lt;done&gt;</span>'));
  assert.ok(html.includes('data-note="Outline &lt;done&gt;"'));
  assert.ok(renderRecordPop(AREAS, TODAY).includes('id="record-note"'));
});

test("a session just saved without a note gets the Add a note prompt; one with a note does not", () => {
  const data = { ...FOCUS, log: [{ date: TODAY, minutes: 25, sessions: [
    { id: "p1", area: "study", task: null, minutes: 25, ended_at: "10:00", note: null },
    { id: "p2", area: "study", task: null, minutes: 25, ended_at: "11:00", note: "Done" },
  ] }] };
  const html = renderFocusLog(data, TODAY, { date: TODAY, id: "p1" });
  assert.ok(html.includes("Your 25 min session is saved.") && /data-session-id="p1"[\s\S]*data-focus-note/.test(html));
  assert.ok(html.includes("data-note-dismiss"));
  assert.ok(!renderFocusLog(data, TODAY, { date: TODAY, id: "p2" }).includes("focus-note-prompt"));
  assert.ok(!renderFocusLog(data, TODAY).includes("focus-note-prompt"));
});

test("the task picker shows pomos done against the plan, and the chosen task gets a − / + line", () => {
  const pop = renderTaskPopover("focus-task", [{ text: "Essay", done: false }, { text: "Read", done: false }], [], "Essay",
    { estimates: { Essay: 4 }, pomos: { Essay: 2, Read: 1 } });
  assert.ok(pop.includes('aria-label="2 of 4 pomos">2/4</span>') && pop.includes('aria-label="1 pomo">1</span>'));
  assert.strictEqual(renderTaskEstimate("", 0, 0), "");
  const line = renderTaskEstimate("Essay", 2, 4);
  assert.ok(line.includes("2 of 4 pomos done") && line.includes('data-task="Essay"'));
  assert.ok(!/data-estimate-step="-1"[^>]*disabled/.test(line));
  assert.ok(/data-estimate-step="-1"[^>]*disabled/.test(renderTaskEstimate("Read", 1, 0)));
  assert.ok(/data-estimate-step="1"[^>]*disabled/.test(renderTaskEstimate("Big", 0, 20)));
  const page = renderFocusPage(FOCUS, IDLE, TASKS, NOW, "", { ...pageOptions, preset: "Revise <ch 5>", estimates: { "Revise <ch 5>": 3 } });
  assert.ok(page.includes("1 of 3 pomos done"));
});

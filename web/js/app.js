// The page's brain: loads data, draws it, reacts to clicks and typing.
// Data comes from api.js, HTML comes from render.js, and the elements are in index.html.

import * as api from "./api.js";
import {
  renderBrief, renderScoreChip, renderToday, baselineLine, renderOnboarding, renderHabitGrid, renderGoals, renderTasks,
  renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
  renderStudyGoals, studyDateHint,
  renderWorkQuestion, WORK_QUESTIONS, weekHoursText,
  renderNav, renderModulePage, renderModuleEdit,
  renderCheckIn, renderCarryOver, renderInsights,
  renderStartingPoint, renderProjection, renderFirstSession,
  renderFocusPanel, renderFocusSummary, durationText,
} from "./render.js";
import { pageFromHash, hashFor } from "./route.js";
import { parseDate } from "./dates.js";
import {
  IDLE, SESSIONS_A_ROUND, startSession, pause, resume, reset, finishEarly, skipBreak, stopCycle, tick,
  keepAway, dropAway, fromSaved, isRunning, isPaused, countdownText, remainingMs, ringShare,
} from "./timer.js";

const MAX_TASKS = 3;
const MAX_GOALS = 3;
const NOTE_SAVE_DELAY_MS = 500;

// Everything the page knows right now.
let areas = [];        // every module the server offers
let settings = null;   // the user's settings
let today = todayKey();
let day = null;        // today's logged data
let editingGoal = null; // index of the goal being edited in Settings, or null
let modulePage = null; // the module whose page is showing ("sleep", "study", "work"), or null
let pageShown = false; // false until the first page has been shown
let carryOver = [];    // yesterday's unfinished tasks offered on Home
let focusToday = null; // the dashboard's focus summary, for Home

const $ = (id) => document.getElementById(id);

// --- Small helpers ---

// Today's date as "YYYY-MM-DD" in the user's own time zone (not UTC).
function todayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${date}`;
}

// Shows one view ("onboarding", "dashboard", "module", "insights" or "settings") and hides the others.
// The nav is hidden during onboarding.
function showView(name) {
  $("loading").hidden = true;
  $("onboarding-view").hidden = name !== "onboarding";
  $("dashboard-view").hidden = name !== "dashboard";
  $("module-view").hidden = name !== "module";
  $("insights-view").hidden = name !== "insights";
  $("settings-view").hidden = name !== "settings";
  $("side-nav").hidden = name === "onboarding";
  if (name === "onboarding") document.body.dataset.page = "onboarding";
}

// Puts a message in one of the small red boxes under a form. Empty text hides it.
function showFormError(id, message) {
  $(id).textContent = message || "";
  $(id).hidden = !message;
}

function showBanner(message) {
  $("error-message").textContent = message;
  $("error-banner").hidden = false;
}

// Runs an action and shows any server error in the banner, so one failed
// request never leaves the page silently broken.
async function safely(action) {
  try {
    await action();
  } catch (error) {
    showBanner(error.message || "Something went wrong.");
  }
}

// The value of every ticked "modules" checkbox inside a form.
function tickedModules(form) {
  return [...form.querySelectorAll('input[name="modules"]:checked')].map((box) => box.value);
}

// --- Start up ---

function showTodayLabel() {
  $("today-label").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
}

async function start() {
  showTodayLabel();
  [areas, settings] = await Promise.all([api.getAreas(), api.getSettings()]);
  if (settings.onboarded) await showPage();
  else showOnboarding();
}

// --- Pages and the nav ---

// Draws the nav's links, with the page showing marked as current.
function drawNav(current) {
  $("nav-links").innerHTML = renderNav(areas, settings.modules, current);
}

// Reads the address ("#/sleep") and shows that page. An address that doesn't
// match a page is put right, so the address bar always says what is showing.
async function showPage(moveFocus = true) {
  if (!settings.onboarded) return;
  const page = pageFromHash(location.hash, settings.modules);
  if (location.hash !== hashFor(page)) history.replaceState(null, "", hashFor(page));
  drawNav(page);
  // The page's name on <body> lets the stylesheet give each page its own glow.
  document.body.dataset.page = page;
  modulePage = null;
  let view = "module";
  if (page === "home") {
    await loadDashboard();
    view = "dashboard";
  } else if (page === "settings") {
    drawSettings();
    view = "settings";
  } else if (page === "insights") {
    $("insights-body").innerHTML = renderInsights(await api.getInsights(today));
    view = "insights";
  } else {
    await loadModulePage(page);
    modulePage = page;
  }
  showView(view);
  // Move focus to the new page's heading so screen readers read it,
  // but not on the very first page: that would steal focus on load.
  if (pageShown && moveFocus) $(`${view}-view`).querySelector("h1").focus();
  pageShown = true;
}

// Clicking a nav link, Back and Forward all change the address.
window.addEventListener("hashchange", () => safely(() => showPage()));

// Loads one module's page and draws it.
async function loadModulePage(id) {
  const [dashboard, todayData] = await Promise.all([api.getDashboard(today), api.getDay(today)]);
  day = todayData;
  const area = dashboard.areas.find((a) => a.id === id);
  $("module-title").textContent = area.label;
  $("module-body").innerHTML = renderModulePage(area, dashboard.dates, today, day, settings, focusPanel(id));
}

// --- Onboarding ---

// Every step, in order. Each is a <div id="onboarding-step-NAME"> in index.html.
const ALL_STEPS = ["welcome", "modules", "sleep", "study", "work", "start", "habits", "goals", "session"];
let onboardingStep = "welcome"; // the step showing right now

// Study and Work are the modules with focus time: the starting point and first session are for them.
const focusModules = () => settings.modules.filter((id) => id === "study" || id === "work");

// The steps this user goes through: Sleep, Study and Work only if they picked them; the
// starting point and the first focus session only with Study or Work.
function onboardingSteps() {
  const picked = settings.modules;
  const steps = ["welcome", "modules"];
  if (picked.includes("sleep")) steps.push("sleep");
  if (picked.includes("study")) steps.push("study");
  if (picked.includes("work")) steps.push("work");
  const focus = focusModules().length > 0;
  if (focus) steps.push("start");
  steps.push("habits", "goals");
  if (focus) steps.push("session");
  return steps;
}

// Shows one step, hides the others, writes "Step X of N", and moves focus to its
// heading so screen readers read it.
function showOnboardingStep(step) {
  for (const name of ALL_STEPS) {
    $(`onboarding-step-${name}`).hidden = name !== step;
  }
  const steps = onboardingSteps();
  $(`onboarding-step-${step}`).querySelector(".step-label").textContent =
    `Step ${steps.indexOf(step) + 1} of ${steps.length}`;
  onboardingStep = step;
  $(`onb-heading-${step}`).focus();
}

// Draws steps from what is saved, so going back (or coming back later) shows earlier choices.
function drawOnboardingModules() {
  $("onboarding-options").innerHTML = renderOnboarding(areas, settings.modules);
}

function drawOnboardingSleep() {
  $("onboarding-sleep-choice").innerHTML = renderSleepChoice(settings, "onb", true);
  // The "Let's work it out" answers are never saved, so they start empty every time.
  $("onboarding-sleep-help").hidden = true;
  for (const field of $("onboarding-sleep-help").querySelectorAll("select, input")) {
    if (field.type === "checkbox") field.checked = false;
    else field.value = "";
  }
  $("onboarding-sleep-suggestion").innerHTML = "";
  showFormError("onboarding-sleep-error", "");
}

// The saved study hours a week, or the default.
function studyHours() {
  const saved = settings.targets.find((t) => t.area_id === "study");
  return saved ? saved.target : areas.find((a) => a.id === "study").default_target;
}

// Study: the saved goals (or one empty row) and the saved hours (or the default).
function drawOnboardingStudy() {
  $("onboarding-study").innerHTML = renderStudyGoals(settings.study_goals, studyHours(), "onb", today);
  showFormError("onboarding-study-error", "");
}

// The saved work hours a week, or the default.
function workHours() {
  const saved = settings.targets.find((t) => t.area_id === "work");
  return saved ? saved.target : areas.find((a) => a.id === "work").default_target;
}

// Work: one question at a time (workScreen 0 to 5), filled in from what is saved.
let workScreen = 0;
const LAST_WORK_SCREEN = WORK_QUESTIONS.length - 1;

function drawOnboardingWork() {
  $("onboarding-work").innerHTML = renderWorkQuestion(workScreen, settings.work, workHours(), "onb", { hideLegend: true });
  $("onb-heading-work").textContent = WORK_QUESTIONS[workScreen];
  $("onboarding-work-sub").textContent = `Work \u00b7 ${workScreen + 1} of ${WORK_QUESTIONS.length}`;
  showFormError("onboarding-work-error", "");
}

function drawOnboardingHabits() {
  $("onboarding-habits").innerHTML = renderHabitList(settings.habits);
}

// The starting point: the honest estimates, with the projection hidden until asked for.
function drawOnboardingStart() {
  $("onboarding-start-fields").innerHTML = renderStartingPoint(settings.modules, settings.starting_point);
  $("onboarding-projection").innerHTML = "";
  $("onboarding-start-submit").textContent = "Show my projection";
  showFormError("onboarding-start-error", "");
}

function drawOnboardingSession() {
  $("onboarding-session-fields").innerHTML = renderFirstSession(settings.modules);
  showFormError("onboarding-session-error", "");
}

// Goals end onboarding unless the first focus session comes after them.
function drawOnboardingGoals() {
  $("onboarding-goals-submit").textContent = onboardingSteps().includes("session") ? "Next" : "Start";
}

// Draws a step (if it has anything to draw) and shows it.
// For Work, screen says which of its six questions to show.
function goToStep(step, screen = 0) {
  if (step === "modules") drawOnboardingModules();
  if (step === "sleep") drawOnboardingSleep();
  if (step === "study") drawOnboardingStudy();
  if (step === "work") {
    workScreen = screen;
    drawOnboardingWork();
  }
  if (step === "habits") drawOnboardingHabits();
  if (step === "start") drawOnboardingStart();
  if (step === "goals") drawOnboardingGoals();
  if (step === "session") drawOnboardingSession();
  showOnboardingStep(step);
}

// The step after the one showing. Worked out again each time, because picking
// areas changes which steps there are.
function nextStep() {
  const steps = onboardingSteps();
  return steps[steps.indexOf(onboardingStep) + 1];
}

// Starts onboarding at the welcome step. Someone who closed the tab halfway
// starts here again, with what they already saved filled in.
function showOnboarding() {
  drawOnboardingModules();
  $("onboarding-goals-form").reset();
  for (const id of ["onboarding-error", "onboarding-sleep-error", "onboarding-study-error", "onboarding-work-error", "onboarding-habits-error", "onboarding-goals-error"]) {
    showFormError(id, "");
  }
  showView("onboarding");
  showOnboardingStep("welcome");
}

// The last step: marks onboarding as done (the server never does this by itself),
// saving any goals at the same time, then opens the dashboard.
async function finishOnboarding(goals = [], page = "home") {
  const finished = { ...settings, onboarded: true };
  if (goals.length > 0) finished.goals = goals;
  settings = await api.putSettings(finished);
  history.replaceState(null, "", hashFor(page));
  pageShown = true;
  await showPage();
}

// Welcome.
$("onboarding-start").addEventListener("click", () => showOnboardingStep("modules"));

// Areas: save the modules (new ones get default targets), then go on to the first screen of the chosen areas.
$("onboarding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settings = await api.postOnboarding(tickedModules(event.target));
    showFormError("onboarding-error", "");
    goToStep(nextStep());
  } catch (error) {
    showFormError("onboarding-error", error.message);
  }
});

// Sleep, "Let's work it out": send the answers (skipped ones left out) and show the suggestion.
$("onboarding-sleep-suggest").addEventListener("click", async () => {
  const help = $("onboarding-sleep-help");
  const answers = {
    habits: [...help.querySelectorAll('input[name="sleep-habit"]:checked')].map((box) => box.value),
  };
  for (const field of help.querySelectorAll('select, input[type="time"]')) {
    if (field.value) answers[field.name] = field.value;
  }
  try {
    const suggestion = await api.getSleepSuggestion(answers);
    $("onboarding-sleep-suggestion").innerHTML = renderSleepSuggestion(suggestion);
    showFormError("onboarding-sleep-error", "");
    $("onboarding-sleep-suggestion").querySelector("input").focus();
  } catch (error) {
    showFormError("onboarding-sleep-error", error.message);
  }
});

// Sleep: save the goal or schedule, then go on.
$("onboarding-sleep-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const choice = readSleepChoice(event.target);
  if (choice.error) return showFormError("onboarding-sleep-error", choice.error);
  try {
    settings = await api.putSettings(withSleepChoice(settings, choice));
    showFormError("onboarding-sleep-error", "");
    goToStep(nextStep());
  } catch (error) {
    showFormError("onboarding-sleep-error", error.message);
  }
});

// Study: "+ Add another" and "Remove" redraw the rows, keeping anything typed so far.
// Used by onboarding ("onb") and the Study page ("mod").
function changeStudyRows(event, container, prefix) {
  const add = event.target.closest("[data-add-study]");
  const remove = event.target.closest("[data-remove-study]");
  if (!add && !remove) return;
  const rows = readStudyRows(container);
  if (add) rows.push({ name: "", date: null });
  if (remove) rows.splice(Number(remove.dataset.removeStudy), 1);
  const hours = container.querySelector('input[name="study-hours"]').value;
  container.innerHTML = renderStudyGoals(rows, hours, prefix, today, prefix === "mod");
  if (add) {
    const names = container.querySelectorAll('input[name="study-name"]');
    names[names.length - 1].focus();
  } else {
    container.querySelector("[data-add-study]").focus();
  }
}

$("onboarding-study").addEventListener("click", (event) => changeStudyRows(event, $("onboarding-study"), "onb"));

// Study: check the goals and hours, save them, then go on.
$("onboarding-study-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const container = $("onboarding-study");
  const hoursText = container.querySelector('input[name="study-hours"]').value;
  const { goals, hours, error } = checkStudy(readStudyRows(container), hoursText);
  if (error) return showFormError("onboarding-study-error", error);
  try {
    settings = await api.putSettings(withStudy(settings, goals, hours));
    showFormError("onboarding-study-error", "");
    goToStep(nextStep());
  } catch (error) {
    showFormError("onboarding-study-error", error.message);
  }
});

// Work: after a screen, show the next one, or the next step after the last.
function afterWorkScreen() {
  if (workScreen < LAST_WORK_SCREEN) goToStep("work", workScreen + 1);
  else goToStep(nextStep());
}

// Work: check the answer, save it, then go on.
$("onboarding-work-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { changes, hours, error } = readWorkAnswer(workScreen, $("onboarding-work"));
  if (error) return showFormError("onboarding-work-error", error);
  try {
    settings = await api.putSettings(withWork(settings, changes, hours));
    showFormError("onboarding-work-error", "");
    afterWorkScreen();
  } catch (error) {
    showFormError("onboarding-work-error", error.message);
  }
});

// Work: skipping saves nothing from this screen.
$("onboarding-work-skip").addEventListener("click", afterWorkScreen);

// Habits: each Add or Remove saves straight away and redraws the list.
async function saveOnboardingHabits(habits) {
  settings = await api.putSettings({ ...settings, habits });
  drawOnboardingHabits();
  showFormError("onboarding-habits-error", "");
}

$("onboarding-habit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("onb-habit-name").value.trim();
  if (!name) return showFormError("onboarding-habits-error", "Give the habit a name.");
  // A short id that stays the same if the habit is renamed later.
  const id = "h" + Date.now().toString(36);
  try {
    await saveOnboardingHabits([...settings.habits, { id, name }]);
    $("onb-habit-name").value = "";
  } catch (error) {
    showFormError("onboarding-habits-error", error.message);
  }
});

$("onboarding-habits").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-habit]");
  if (!button) return;
  const index = Number(button.dataset.removeHabit);
  safely(() => saveOnboardingHabits(settings.habits.filter((_, i) => i !== index)));
});

// Next and Skip both move on; habits already added stay saved either way.
$("onboarding-habits-next").addEventListener("click", () => goToStep("goals"));
$("onboarding-skip-habits").addEventListener("click", () => goToStep("goals"));

// Starting point: the first Submit saves the estimates and shows the projection;
// the second goes on. Changing a number shows the projection button again.
$("onboarding-start-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("onboarding-projection").innerHTML.trim() !== "") return goToStep(nextStep());
  const start = { date: today, study_hours: null, work_hours: null };
  for (const input of event.target.querySelectorAll("input")) {
    const text = input.value.trim();
    if (text === "") continue;
    const hours = Number(text);
    if (!(hours >= 0 && hours <= 168)) return showFormError("onboarding-start-error", "Hours a week must be between 0 and 168.");
    start[input.name] = hours;
  }
  try {
    settings = await api.putSettings({ ...settings, starting_point: start });
    showFormError("onboarding-start-error", "");
    const estimates = { study: start.study_hours, work: start.work_hours };
    const projection = renderProjection(estimates, settings.targets);
    if (!projection) return goToStep(nextStep());  // nothing estimated: nothing to project
    $("onboarding-projection").innerHTML = projection;
    $("onboarding-start-submit").textContent = "Next";
  } catch (error) {
    showFormError("onboarding-start-error", error.message);
  }
});

$("onboarding-start-form").addEventListener("input", () => {
  $("onboarding-projection").innerHTML = "";
  $("onboarding-start-submit").textContent = "Show my projection";
});

// Goals: save any goals that have a name, then finish (or go on to the first session).
// Rows left blank are ignored.
async function afterGoals(goals) {
  if (!onboardingSteps().includes("session")) return finishOnboarding(goals);
  if (goals.length > 0) settings = await api.putSettings({ ...settings, goals });
  goToStep("session");
}

$("onboarding-goals-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const goals = [];
  for (const row of event.target.querySelectorAll(".goal-row")) {
    const name = row.querySelector('input[name="name"]').value.trim();
    const detail = row.querySelector('input[name="detail"]').value.trim();
    if (name) goals.push({ name, percent: 0, detail });
  }
  try {
    await afterGoals(goals);
  } catch (error) {
    showFormError("onboarding-goals-error", error.message);
  }
});

$("onboarding-skip-goals").addEventListener("click", () => safely(() => afterGoals([])));

// First focus session: finish onboarding and open the module's page with the timer running.
$("onboarding-session-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const area = form.querySelector('input[name="session-area"]:checked, input[type="hidden"][name="session-area"]').value;
  const minutes = Number(form.querySelector('input[name="session-minutes"]:checked').value);
  try {
    askForNotifications();
    focusMessage = "";
    setTimer(startSession({ area, task: null, minutes }, Date.now()));
    await finishOnboarding([], area);
    announce(`Your first session started: ${minutes} minutes.`);
  } catch (error) {
    showFormError("onboarding-session-error", error.message);
  }
});

$("onboarding-skip-session").addEventListener("click", () => safely(() => finishOnboarding()));

// Back buttons: go to the step before the one showing, redrawn from what is saved.
$("onboarding-view").addEventListener("click", (event) => {
  if (!event.target.closest("[data-back]")) return;
  if (onboardingStep === "work" && workScreen > 0) return goToStep("work", workScreen - 1);
  const steps = onboardingSteps();
  const previous = steps[steps.indexOf(onboardingStep) - 1];
  // Going back into Work lands on its last question; other steps ignore the screen.
  if (previous) goToStep(previous, LAST_WORK_SCREEN);
});

// --- Sleep answers (onboarding and Settings) ---

// Shows only the panel for the chosen answer (goal, schedule or help) inside one form.
function showSleepPanels(form, mode) {
  for (const panel of form.querySelectorAll(".sleep-panel")) {
    panel.hidden = panel.dataset.mode !== mode;
  }
}

// Reads the Sleep answer from a form: { schedule, hours, error }.
// A schedule is { bedtime, wake_time }; a goal is hours with no schedule.
function readSleepChoice(form) {
  const mode = form.querySelector('input[name="sleep-mode"]:checked').value;
  const value = (name) => {
    const field = form.querySelector(`[name="${name}"]`);
    return field ? field.value.trim() : "";
  };
  const failed = (error) => ({ schedule: null, hours: null, error });

  // "Let's work it out" saves what is in the suggestion, so there must be one.
  let prefix = "sleep";
  if (mode === "help") {
    if (!form.querySelector(".sleep-suggestion")) return failed('Press "Show my suggestion" first.');
    prefix = "sugg";
  }

  if (mode === "schedule" || (mode === "help" && form.querySelector('[name="sugg-bed"]'))) {
    const bedtime = value(`${prefix}-bed`);
    const wakeTime = value(`${prefix}-wake`);
    if (!bedtime || !wakeTime || bedtime === wakeTime) return failed("Fill in both times, and make them different.");
    return { schedule: { bedtime, wake_time: wakeTime }, hours: null, error: "" };
  }

  const hours = Number(value(`${prefix}-hours`));
  if (!(hours > 0 && hours <= 24)) return failed("Sleep hours must be a number above 0 and up to 24.");
  return { schedule: null, hours, error: "" };
}

// Settings with the Sleep answer in: a schedule (the server sets the sleep target
// from its times), or a goal in hours with no schedule.
function withSleepChoice(current, choice) {
  if (choice.schedule) return { ...current, sleep_schedule: choice.schedule };
  const target = { area_id: "sleep", target: choice.hours, mode: "up" };
  return { ...current, sleep_schedule: null, targets: mergeTargets(current.targets, [target]) };
}

// --- Study answers ---

// The goal rows as typed: [{ name, date, badDate }], names trimmed, a blank date as null.
// badDate: a half-typed date (e.g. no year), which the browser reports as blank.
// The Study form's rows as typed. dateText is what was written; date is what it was read as
// (null when blank), badDate is true when it can't be read. stepsText is null without a Steps box.
function readStudyRows(container) {
  return [...container.querySelectorAll(".study-goal-row")].map((row) => {
    const dateText = row.querySelector('input[name="study-date"]').value.trim();
    const read = parseDate(dateText, today);
    const hours = row.querySelector('input[name="study-goal-hours"]').value.trim();
    const steps = row.querySelector('textarea[name="study-steps"]');
    return {
      name: row.querySelector('input[name="study-name"]').value.trim(),
      dateText,
      date: read ? read.date : null,
      badDate: read === null,
      hours: hours === "" ? null : Number(hours),
      stepsText: steps ? steps.value : null,
    };
  });
}

const MAX_STEPS = 10;
const MAX_STEP_TEXT = 100;

// A Steps box's lines, blank ones dropped.
function stepLines(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

// Checks the Study page: { goals, hours, error }. Fully blank rows are dropped.
// Each goal's steps are a list of texts, or null when the form had no Steps box.
function checkStudy(rows, hoursText) {
  const kept = rows.filter((g) => g.name || g.dateText || (g.stepsText && g.stepsText.trim()));
  if (!kept.some((g) => g.name)) return { error: "Tell Compass what you're studying for." };
  if (kept.some((g) => !g.name)) return { error: "Give each goal a name, or remove it." };
  const number = (g) => rows.indexOf(g) + 1;
  const bad = kept.find((g) => g.badDate);
  if (bad) return { error: `Can't read the date for goal ${number(bad)}. Try “in 12 days”, “next Monday” or “5 Dec”, or clear it.` };
  const badHours = kept.find((g) => g.hours !== null && !(g.hours > 0 && g.hours <= 1000));
  if (badHours) return { error: `Hours for goal ${number(badHours)} must be between 0 and 1000, or blank.` };
  for (const g of kept) {
    if (g.stepsText === null) continue;
    const lines = stepLines(g.stepsText);
    if (lines.length > MAX_STEPS) return { error: `Goal ${number(g)} has ${lines.length} steps. Keep it to ${MAX_STEPS}.` };
    if (lines.some((line) => line.length > MAX_STEP_TEXT)) {
      return { error: `Keep each step for goal ${number(g)} under ${MAX_STEP_TEXT} characters.` };
    }
  }
  const goals = kept.map(({ name, date, hours, stepsText }) => (
    { name, date, hours, steps: stepsText === null ? null : stepLines(stepsText) }));
  const hours = Number(hoursText);
  if (hoursText.trim() === "" || !(hours > 0 && hours <= 168)) {
    return { error: "Hours a week must be between 0 and 168." };
  }
  return { goals, hours };
}

// The goals to save, with steps. A goal keeps its saved steps when the form had none to show
// (onboarding), and a step keeps its tick when its text is unchanged. The saved goal is found
// by name, else by position, so renaming a goal keeps its ticks.
function withSteps(oldGoals, goals) {
  return goals.map((g, i) => {
    const old = oldGoals.find((o) => o.name === g.name) || oldGoals[i];
    const oldSteps = old ? old.steps || [] : [];
    if (g.steps === null) return { ...g, steps: oldSteps };
    const steps = g.steps.map((text) => ({ text, done: oldSteps.some((s) => s.text === text && s.done) }));
    return { ...g, steps };
  });
}

// Settings with new study goals and hours. Keeps a saved "Stay under" rule,
// since the Study page has no choice for it.
function withStudy(oldSettings, goals, hours) {
  const saved = oldSettings.targets.find((t) => t.area_id === "study");
  const target = { area_id: "study", target: hours, mode: saved ? saved.mode : "up" };
  return {
    ...oldSettings,
    study_goals: withSteps(oldSettings.study_goals, goals),
    targets: mergeTargets(oldSettings.targets, [target]),
  };
}

// --- Work answers ---

// Reads the Work question showing in container: { changes, hours, error }.
// changes is part of the work profile; nothing answered gives {} (the same as Skip).
function readWorkAnswer(index, container) {
  const ticked = (name) => [...container.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const text = (name) => container.querySelector(`input[name="${name}"]`).value.trim() || null;
  if (index === 0) return { changes: ticked("work-kind").length ? { kind: ticked("work-kind")[0] } : {} };
  if (index === 1) return { changes: { role: text("work-role") } };
  if (index === 3) return { changes: ticked("work-focus").length ? { focus: ticked("work-focus")[0] } : {} };
  if (index === 4) return { changes: { goal: text("work-goal") } };
  if (index === 5) return { changes: { derailers: ticked("work-derailer") } };

  if (container.querySelector('input[name="work-varies"]').checked) {
    const hoursText = container.querySelector('input[name="work-hours"]').value;
    const hours = Number(hoursText);
    if (hoursText.trim() === "" || !(hours > 0 && hours <= 168)) {
      return { error: "Hours a week must be between 0 and 168." };
    }
    return { changes: { hours_vary: true, schedule: null }, hours };
  }
  const days = [...container.querySelectorAll('.day-toggle[aria-pressed="true"]')].map((b) => Number(b.dataset.day));
  const start = container.querySelector('input[name="work-start"]').value;
  const end = container.querySelector('input[name="work-end"]').value;
  if (days.length === 0 && !start && !end) return { changes: {} };
  if (days.length === 0) return { error: "Pick at least one day." };
  if (!start || !end) return { error: "Enter a start and end time." };
  if (start === end) return { error: "Start and end can't be the same." };
  return { changes: { hours_vary: false, schedule: { days, start, end } } };
}

// Settings with the answer merged into the work profile. With hours (It varies),
// the Work target is set too, keeping a saved "Stay under" rule.
function withWork(current, changes, hours) {
  const next = { ...current, work: { ...current.work, ...changes } };
  if (hours === undefined) return next;
  const saved = current.targets.find((t) => t.area_id === "work");
  const target = { area_id: "work", target: hours, mode: saved ? saved.mode : "up" };
  return { ...next, targets: mergeTargets(current.targets, [target]) };
}

// The new targets, plus the old ones for areas the new list doesn't cover
// (so saving the other areas never drops the sleep target).
function mergeTargets(oldTargets, newTargets) {
  const covered = newTargets.map((t) => t.area_id);
  return [...oldTargets.filter((t) => !covered.includes(t.area_id)), ...newTargets];
}

// Picking goal / schedule / "Let's work it out" shows that answer's panel.
document.addEventListener("change", (event) => {
  if (event.target.name === "sleep-mode") showSleepPanels(event.target.form, event.target.value);
});

// Typing a bed or wake time updates the "= 8 h a night" next to it.
document.addEventListener("input", (event) => {
  const times = event.target.closest(".sleep-times");
  if (!times || event.target.type !== "time") return;
  const [bed, wake] = times.querySelectorAll('input[type="time"]');
  times.querySelector(".sleep-gap").textContent = gapText(bed.value, wake.value);
});

// Day buttons toggle on click.
document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".day-toggle");
  if (!toggle) return;
  toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
  updateWorkWeek(toggle.closest(".work-question"));
});

// Changing days or times updates "= 40 h a week".
function updateWorkWeek(question) {
  const schedule = question.querySelector(".work-schedule");
  if (!schedule) return;
  const days = schedule.querySelectorAll('.day-toggle[aria-pressed="true"]').length;
  const [start, end] = schedule.querySelectorAll('input[type="time"]');
  schedule.querySelector(".work-week").textContent = weekHoursText(days, start.value, end.value);
}

document.addEventListener("input", (event) => {
  const question = event.target.closest(".work-question");
  if (question && event.target.type === "time") updateWorkWeek(question);
});

// "It varies" swaps the schedule for the hours a week.
document.addEventListener("change", (event) => {
  const question = event.target.closest(".work-question");
  if (!question || event.target.name !== "work-varies") return;
  question.querySelector(".work-schedule").hidden = event.target.checked;
  question.querySelector(".work-varies-panel").hidden = !event.target.checked;
});

// --- Dashboard ---

async function loadDashboard() {
  const [dashboard, todayData] = await Promise.all([api.getDashboard(today), api.getDay(today)]);
  day = todayData;
  drawDashboard(dashboard);
}

function drawDashboard(dashboard) {
  $("brief").innerHTML = renderBrief(dashboard.brief);
  $("score-chips").innerHTML = dashboard.areas.map(renderScoreChip).join("");
  $("today-hero").innerHTML = renderToday(dashboard.score, baselineLine(dashboard.learning && dashboard.learning.text, null));
  $("check-in").innerHTML = renderCheckIn(day, dashboard.tags);
  carryOver = dashboard.carry_over;
  $("carry-over").innerHTML = renderCarryOver(carryOver);

  const completion = dashboard.habits.completion;
  $("habit-completion").textContent = completion === null ? "" : `${completion}% this week`;
  $("habit-grid").innerHTML = renderHabitGrid(dashboard.habits.grid, settings.habits);
  $("goals").innerHTML = renderGoals(settings.goals);
  $("tasks").innerHTML = renderTasks(day.tasks);
  focusToday = dashboard.focus;
  $("focus-summary").innerHTML = renderFocusSummary(focusToday, timer, Date.now());

  // Don't overwrite the note while the user is typing in it.
  if (document.activeElement !== $("note")) $("note").value = day.note;
}

// Saves changes to today, then redraws everything from the server's answer.
async function saveToday(changes) {
  day = { ...day, ...changes };
  day = await api.putDay(today, day);
  drawDashboard(await api.getDashboard(today));
}

// --- Module pages ---

// What is typed in some log inputs, as changes to a day: { sleep_hours: 7, ... }.
// Blank means "I don't know": null, never 0.
function readLogInputs(inputs) {
  const changes = {};
  for (const input of inputs) {
    const blank = input.value.trim() === "";
    if (input.type === "time") changes[input.name] = blank ? null : input.value;
    else changes[input.name] = blank ? null : Number(input.value);
  }
  return changes;
}

// Only one sleep version counts: with times, the server works out the hours;
// with hours, any old times are cleared so they can't override them.
function sleepLogRule() {
  return settings.sleep_schedule ? { sleep_hours: null } : { bedtime: null, wake_time: null };
}

// The page's log form: saves only this module's fields on today, then redraws the page.
$("module-view").addEventListener("submit", (event) => {
  if (event.target.id !== "module-log-form") return;
  event.preventDefault();
  safely(async () => {
    const changes = readLogInputs(event.target.querySelectorAll("input"));
    if (event.target.dataset.area === "sleep") Object.assign(changes, sleepLogRule());
    day = await api.putDay(today, { ...day, ...changes });
    await loadModulePage(modulePage);
    // After the redraw, because the redraw replaces the status line.
    $("module-log-status").textContent = `Saved ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  });
});

let detailsBeforeEdit = ""; // the details panel's HTML, kept while the Edit form is open

// Edit swaps the details panel for the module's form; Cancel puts the details back
// as they were, without touching the rest of the page.
// Inside the Study form, "+ Add another" and "Remove" redraw its rows.
$("module-view").addEventListener("click", (event) => {
  if (event.target.closest("#module-edit")) {
    const hours = { study: studyHours, work: workHours }[modulePage];
    detailsBeforeEdit = $("module-details").innerHTML;
    const title = $("module-details-title").textContent;
    $("module-details").innerHTML = renderModuleEdit(modulePage, settings, hours ? hours() : null, title, today);
    $("module-edit-form").querySelector("input, select, button").focus();
  } else if (event.target.closest("#module-edit-cancel")) {
    $("module-details").innerHTML = detailsBeforeEdit;
    $("module-edit").focus();
  } else if (event.target.closest("#module-study")) {
    changeStudyRows(event, $("module-study"), "mod");
  }
});

// A goal's date box: say what the date was read as while it is typed.
document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.name !== "study-date") return;
  const hint = document.getElementById(input.getAttribute("aria-describedby"));
  if (hint) hint.textContent = studyDateHint(input.value, today);
});

// A step's checkbox on the Study page: save the tick, then redraw with focus kept on it.
$("module-view").addEventListener("change", (event) => {
  const box = event.target.closest("[data-step]");
  if (!box) return;
  const goalIndex = Number(box.dataset.goal);
  const stepIndex = Number(box.dataset.step);
  const boxId = box.id;
  safely(async () => {
    const goals = settings.study_goals.map((g, i) => (i !== goalIndex ? g : {
      ...g,
      steps: g.steps.map((step, j) => (j === stepIndex ? { ...step, done: box.checked } : step)),
    }));
    settings = await api.putSettings({ ...settings, study_goals: goals });
    await loadModulePage(modulePage);
    const again = $(boxId);
    if (again) again.focus();
  });
});

// The settings with the Edit form's answers in, or { error } with the message to show.
function readModuleEdit(form) {
  if (modulePage === "sleep") {
    const choice = readSleepChoice(form);
    return choice.error ? { error: choice.error } : { next: withSleepChoice(settings, choice) };
  }
  if (modulePage === "study") {
    const hoursText = form.querySelector('input[name="study-hours"]').value;
    const { goals, hours, error } = checkStudy(readStudyRows($("module-study")), hoursText);
    return error ? { error } : { next: withStudy(settings, goals, hours) };
  }
  let next = settings;
  for (const [i, fieldset] of [...form.querySelectorAll(".work-question")].entries()) {
    const { changes, hours, error } = readWorkAnswer(i, fieldset);
    if (error) return { error };
    next = withWork(next, changes, hours);
  }
  return { next };
}

// The Edit form: check it, save the settings, then redraw the page.
$("module-view").addEventListener("submit", async (event) => {
  if (event.target.id !== "module-edit-form") return;
  event.preventDefault();
  const { next, error } = readModuleEdit(event.target);
  if (error) return showFormError("module-edit-error", error);
  try {
    settings = await api.putSettings(next);
    await loadModulePage(modulePage);
    $("module-edit").focus();
  } catch (error) {
    showFormError("module-edit-error", error.message);
  }
});

// --- Focus timer ---
// The rules live in timer.js; this part keeps the state, ticks it, saves finished
// sessions and draws the timer on the Study and Work pages and on Home.

const TIMER_KEY = "compass.timer";
const UNSAVED_KEY = "compass.unsaved-sessions";
const BASE_TITLE = document.title;
const RETRY_MS = 60_000;

// Storage can be missing or blocked (private windows): then the timer still works until a reload.
function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do: the state still lives in this page.
  }
}

let timer = fromSaved(readStored(TIMER_KEY));
// Finished sessions not yet saved on the server, oldest first: { date, area, task, minutes, ended_at }.
let unsaved = Array.isArray(readStored(UNSAVED_KEY)) ? readStored(UNSAVED_KEY) : [];
let focusMessage = ""; // what just happened, shown under the timer
let lastRetry = 0;

// The timer's HTML for a module page ("" for Sleep, which has no timer).
function focusPanel(areaId) {
  if (areaId !== "study" && areaId !== "work") return "";
  const goals = settings ? settings.study_goals.map((g) => g.name) : [];
  return renderFocusPanel(areaId, timer, (day && day.tasks) || [], Date.now(), focusMessage, goals);
}

// Reads text out to screen readers, on whatever page is showing.
function announce(text) {
  $("focus-announce").textContent = text;
}

function askForNotifications() {
  if ("Notification" in window && Notification.permission === "default") {
    Promise.resolve(Notification.requestPermission()).catch(() => {});
  }
}

function notify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, tag: "compass-timer" });
    }
  } catch {
    // Some browsers only allow notifications from a service worker; the page shows the words anyway.
  }
}

// The time left, the ring and the tab title, without redrawing anything else.
function updateClock(now) {
  const left = countdownText(remainingMs(timer, now));
  for (const text of document.querySelectorAll("[data-timer-text]")) text.textContent = left;
  const share = Math.round(ringShare(timer, now) * 1000) / 10;
  for (const ring of document.querySelectorAll("[data-timer-ring]")) ring.setAttribute("stroke-dasharray", `${share} 100`);
  if (isRunning(timer)) document.title = `${left} · ${BASE_TITLE}`;
  else if (isPaused(timer)) document.title = `Paused · ${BASE_TITLE}`;
  else if (timer.phase === "away") document.title = `Save your session? · ${BASE_TITLE}`;
  else document.title = BASE_TITLE;
}

// Draws the timer again wherever it shows. Keyboard focus that was on a timer
// button goes to the new timer's first button, so it is never dropped.
function redrawFocus(moveFocus = false) {
  const now = Date.now();
  const holder = modulePage ? $("focus-timer") : null;
  if (holder) {
    const hadFocus = holder.contains(document.activeElement);
    holder.innerHTML = focusPanel(modulePage);
    if (hadFocus || moveFocus) {
      const target = holder.querySelector("[data-focus], button[type='submit'], a");
      if (target) target.focus();
    }
  }
  if (!$("dashboard-view").hidden && focusToday) {
    $("focus-summary").innerHTML = renderFocusSummary(focusToday, timer, now);
  }
  updateClock(now);
}

function setTimer(next, moveFocus = false) {
  timer = next;
  store(TIMER_KEY, timer);
  redrawFocus(moveFocus);
}

// After sessions change: the page's numbers again, without touching what is being typed.
// On a module page every panel is swapped for a fresh one except the log form (only its
// breakdown line changes) and an open Edit form.
async function refreshAfterSessions() {
  if (modulePage) {
    const id = modulePage;
    const [dashboard, todayData] = await Promise.all([api.getDashboard(today), api.getDay(today)]);
    if (modulePage !== id) return;
    day = todayData;
    const area = dashboard.areas.find((a) => a.id === id);
    const fresh = document.createElement("div");
    fresh.innerHTML = renderModulePage(area, dashboard.dates, today, day, settings, focusPanel(id));
    const panels = [...fresh.children];
    const active = document.activeElement;
    const activeId = active && active.id;
    const inTimer = Boolean(active && active.closest(".module-focus"));
    const editing = $("module-edit-form") !== null;
    [...$("module-body").children].forEach((old, i) => {
      const next = panels[i];
      if (!next) return;
      if (old.classList.contains("module-log")) {
        const line = next.querySelector("#focus-breakdown");
        const oldLine = old.querySelector("#focus-breakdown");
        if (line && oldLine) {
          oldLine.textContent = line.textContent;
          oldLine.hidden = line.hidden;
        }
      } else if (!(old.classList.contains("module-details") && editing)) {
        old.replaceWith(next);
      }
    });
    if (document.activeElement === document.body || !document.activeElement) {
      const target = (activeId && $(activeId)) || (inTimer && $("focus-timer").querySelector("[data-focus], button, input"));
      if (target) target.focus();
    }
  } else if (!$("dashboard-view").hidden) {
    drawDashboard(await api.getDashboard(today));
  }
  updateClock(Date.now());
}

// Saves finished sessions, oldest first. One the server can't take now (it isn't running)
// stays in the list and is tried again later; one it refuses as wrong is let go.
let flushing = false;
async function flushSessions() {
  if (flushing || unsaved.length === 0) return;
  flushing = true;
  let saved = false;
  try {
    while (unsaved.length > 0) {
      const { date, ...session } = unsaved[0];
      try {
        const answer = await api.postSession(date, session);
        if (date === today) day = answer;
        saved = true;
      } catch (error) {
        if (error.code !== "invalid" && error.code !== "bad_request") {
          showBanner(`Your ${durationText(session.minutes)} session isn't saved yet (${error.message}). Compass will try again.`);
          return;
        }
        showBanner(`A focus session couldn't be saved: ${error.message}`);
      }
      unsaved = unsaved.slice(1);
      store(UNSAVED_KEY, unsaved);
    }
  } finally {
    flushing = false;
  }
  if (saved) await refreshAfterSessions();
}

function saveSession(session) {
  unsaved = [...unsaved, session];
  store(UNSAVED_KEY, unsaved);
  safely(flushSessions);
}

// What each timer event means for the person: the words to show, read out and notify.
function eventWords(events) {
  const types = events.map((e) => e.type);
  if (types.includes("break")) {
    const long = events.find((e) => e.type === "break").long;
    return { title: "Session done", text: long
      ? `${SESSIONS_A_ROUND} sessions done. Take a 15-minute break.`
      : "Session done. Take a 5-minute break." };
  }
  if (types.includes("focus")) {
    const round = events.find((e) => e.type === "focus").round;
    return { title: "Break over", text: `Session ${round} of ${SESSIONS_A_ROUND} started.` };
  }
  if (types.includes("roundDone")) {
    // The start form already says "Round done" on the page, so this is only read out and notified.
    return { title: "Round done", text: `Round done: ${SESSIONS_A_ROUND} sessions. Start another when you're ready.`, quiet: true };
  }
  if (types.includes("away")) {
    return { text: "A session ended while Compass wasn't open. Save it or discard it." };
  }
  if (types.includes("breakAway")) {
    return { text: "The break ended while Compass wasn't open, so the cycle stopped." };
  }
  return null;
}

function onTick() {
  const now = Date.now();
  const { state, events } = tick(timer, now);
  if (state !== timer) {
    timer = state;
    store(TIMER_KEY, timer);
  }
  if (events.length > 0) {
    for (const event of events) {
      if (event.type === "session") saveSession(event.session);
    }
    const words = eventWords(events);
    if (words) {
      focusMessage = words.quiet ? "" : words.text;
      announce(words.text);
      if (words.title) notify(words.title, words.text);
    }
    redrawFocus();
  } else {
    updateClock(now);
  }
  if (unsaved.length > 0 && !flushing && now - lastRetry > RETRY_MS) {
    lastRetry = now;
    safely(flushSessions);
  }
}

// One tick a second from a worker (it keeps time in a background tab); a plain
// interval if workers aren't available.
function startTicking() {
  try {
    const worker = new Worker("js/ticker.js");
    worker.addEventListener("message", onTick);
    worker.addEventListener("error", () => {
      worker.terminate();
      setInterval(onTick, 1000);
    });
  } catch {
    setInterval(onTick, 1000);
  }
}

// The timer's buttons: Pause, Resume, Finish early, Reset, Skip break, Stop, Save, Discard.
function focusAction(action) {
  const now = Date.now();
  focusMessage = "";
  if (action === "pause") setTimer(pause(timer, now), true);
  else if (action === "resume") setTimer(resume(timer, now), true);
  else if (action === "reset") {
    focusMessage = "Session reset. Nothing was saved.";
    setTimer(reset(), true);
  } else if (action === "stop") {
    focusMessage = "Stopped.";
    setTimer(stopCycle(), true);
  } else if (action === "skip") {
    const next = skipBreak(timer, now);
    focusMessage = next.phase === "done" ? `Round done: ${SESSIONS_A_ROUND} sessions.` : `Session ${next.round} of ${SESSIONS_A_ROUND} started.`;
    setTimer(next, true);
  } else if (action === "finish") {
    const { state, session } = finishEarly(timer, now);
    focusMessage = session ? `Saved ${durationText(session.minutes)}.` : "Under a minute, so nothing was saved.";
    setTimer(state, true);
    if (session) saveSession(session);
  } else if (action === "keep") {
    const { state, session } = keepAway(timer);
    focusMessage = `Saved ${durationText(session.minutes)}.`;
    setTimer(state, true);
    saveSession(session);
  } else if (action === "drop") {
    focusMessage = "Discarded.";
    setTimer(dropAway(), true);
  }
  if (focusMessage) announce(focusMessage);
}

$("module-view").addEventListener("click", (event) => {
  const button = event.target.closest("[data-focus]");
  if (button) {
    focusAction(button.dataset.focus);
    return;
  }
  const remove = event.target.closest("[data-session-remove]");
  if (remove) {
    safely(async () => {
      day = await api.deleteSession(today, remove.dataset.sessionRemove);
      focusMessage = "Session removed.";
      announce(focusMessage);
      await refreshAfterSessions();
      const next = $("focus-sessions").querySelector("[data-session-remove]") || $("focus-timer").querySelector("button");
      if (next) next.focus();
    });
  }
});

// Start: session 1 of a round, with the length and task picked in the form.
$("module-view").addEventListener("submit", (event) => {
  if (event.target.id !== "focus-form") return;
  event.preventDefault();
  const form = event.target;
  const picked = form.querySelector('input[name="focus-minutes"]:checked');
  const minutes = picked ? Number(picked.value) : 25;
  const task = form.querySelector("#focus-task").value || null;
  askForNotifications();
  focusMessage = "";
  setTimer(startSession({ area: form.dataset.area, task, minutes }, Date.now()), true);
  announce(`Session 1 of ${SESSIONS_A_ROUND} started: ${minutes} minutes.`);
});

// --- Error banner ---

$("error-dismiss").addEventListener("click", () => {
  $("error-banner").hidden = true;
});

// --- Focus tasks ---

$("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("task-text").value.trim();
  if (!text) return showFormError("task-error", "Type a task first.");
  if (day.tasks.length >= MAX_TASKS) {
    return showFormError("task-error", `You can have up to ${MAX_TASKS} focus tasks a day. Finish or untick one first.`);
  }
  showFormError("task-error", "");
  safely(async () => {
    await saveToday({ tasks: [...day.tasks, { text, done: false }] });
    $("task-text").value = "";
  });
});

// One listener for all task checkboxes (they are redrawn often).
$("tasks").addEventListener("change", (event) => {
  const index = Number(event.target.dataset.index);
  const tasks = day.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t));
  safely(() => saveToday({ tasks }));
});

// Yesterday's unfinished tasks: a click adds one to today.
$("carry-over").addEventListener("click", (event) => {
  const button = event.target.closest("[data-carry]");
  if (!button || day.tasks.length >= MAX_TASKS) return;
  const text = carryOver[Number(button.dataset.carry)];
  safely(() => saveToday({ tasks: [...day.tasks, { text, done: false }] }));
});

// --- Check-in ---

// Saves one check-in change, then puts focus back on the control that was used
// (the redraw replaces it, which would otherwise drop keyboard users at the top).
function saveCheckIn(changes, selector) {
  safely(async () => {
    await saveToday(changes);
    const control = $("check-in").querySelector(selector);
    if (control) control.focus();
  });
}

// Mood and the rest-day box.
$("check-in").addEventListener("change", (event) => {
  if (event.target.name === "mood") {
    saveCheckIn({ mood: Number(event.target.value) }, `input[name="mood"][value="${event.target.value}"]`);
  } else if (event.target.id === "rest-day") {
    saveCheckIn({ rest: event.target.checked }, "#rest-day");
  }
});

// Tags toggle on click; Clear takes the mood away again.
$("check-in").addEventListener("click", (event) => {
  const toggle = event.target.closest(".tag-toggle");
  if (toggle) {
    const tag = toggle.dataset.tag;
    const tags = day.tags.includes(tag) ? day.tags.filter((t) => t !== tag) : [...day.tags, tag];
    saveCheckIn({ tags }, `.tag-toggle[data-tag="${tag}"]`);
  } else if (event.target.closest("[data-clear-mood]")) {
    saveCheckIn({ mood: null }, 'input[name="mood"]');
  }
});

// --- Habits ---

$("habit-grid").addEventListener("click", (event) => {
  const cell = event.target.closest(".habit-cell");
  if (!cell) return;
  const { habit, date } = cell.dataset;
  safely(async () => {
    if (date === today) {
      await saveToday({ habits: { ...day.habits, [habit]: !day.habits[habit] } });
      return;
    }
    // An earlier day in the grid: load it, flip the habit, save it back.
    const other = await api.getDay(date);
    await api.putDay(date, { ...other, habits: { ...other.habits, [habit]: !other.habits[habit] } });
    drawDashboard(await api.getDashboard(today));
  });
});

// --- Quick capture ---

let noteTimer = null;

async function saveNote() {
  clearTimeout(noteTimer);
  const note = $("note").value;
  if (note === day.note) return;
  $("note-status").textContent = "Saving...";
  try {
    day = await api.putDay(today, { ...day, note });
    $("note-status").textContent = "Saved";
  } catch (error) {
    $("note-status").textContent = "Not saved";
    showBanner(error.message);
  }
}

// Save 500 ms after the user stops typing, and when they leave the box.
$("note").addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(saveNote, NOTE_SAVE_DELAY_MS);
});
$("note").addEventListener("blur", saveNote);

// --- Insights: pausing streaks ---

// "2026-11-19" -> "2026-11-18".
function dayBefore(dateKey) {
  const d = new Date(dateKey + "T00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function redrawInsights() {
  $("insights-body").innerHTML = renderInsights(await api.getInsights(today));
}

// Pause streaks from today until the chosen date.
$("insights-view").addEventListener("submit", (event) => {
  if (event.target.id !== "shield-form") return;
  event.preventDefault();
  const end = event.target.elements.end.value;
  if (!end || end < today) return showFormError("shield-error", "Pick an end date from today on.");
  const shield = { start: today, end, reason: event.target.elements.reason.value };
  safely(async () => {
    settings = await api.putSettings({ ...settings, shields: [...settings.shields, shield].slice(-20) });
    await redrawInsights();
    $("insights-view").querySelector("[data-shield-end]").focus();
  });
});

// End the pause now: a pause that started today goes; an older one ends yesterday, so today counts.
$("insights-view").addEventListener("click", (event) => {
  if (!event.target.closest("[data-shield-end]")) return;
  const shields = settings.shields
    .map((s) => (s.start <= today && today <= s.end ? (s.start === today ? null : { ...s, end: dayBefore(today) }) : s))
    .filter(Boolean);
  safely(async () => {
    settings = await api.putSettings({ ...settings, shields });
    await redrawInsights();
    $("shield-reason").focus();
  });
});

// --- Settings ---

function drawSettings() {
  $("settings-modules").innerHTML = renderOnboarding(areas, settings.modules);
  $("settings-habits").innerHTML = renderHabitList(settings.habits);
  $("settings-goals").innerHTML = renderGoalList(settings.goals);
  for (const radio of $("tone-choice").querySelectorAll("input")) radio.checked = radio.value === settings.tone;
  for (const id of ["modules-error", "habit-error", "goal-error", "import-error"]) {
    showFormError(id, "");
  }
}

// Saves the whole settings object and redraws the Settings screen.
async function saveSettings(newSettings) {
  settings = await api.putSettings(newSettings);
  drawSettings();
}

// Tone: saved as soon as one is picked.
$("tone-choice").addEventListener("change", (event) => {
  safely(async () => {
    await saveSettings({ ...settings, tone: event.target.value });
    $("tone-status").textContent = "Saved. The brief uses it from now on.";
  });
});

// Modules: the same rules as onboarding (1 to 5, new ones get default targets).
$("modules-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settings = await api.postOnboarding(tickedModules(event.target));
    drawSettings();
    drawNav("settings");
    $("data-status").textContent = "";
  } catch (error) {
    showFormError("modules-error", error.message);
  }
});

$("habit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("habit-name").value.trim();
  if (!name) return showFormError("habit-error", "Give the habit a name.");
  // A short id that stays the same if the habit is renamed later.
  const id = "h" + Date.now().toString(36);
  try {
    await saveSettings({ ...settings, habits: [...settings.habits, { id, name }] });
    $("habit-name").value = "";
  } catch (error) {
    showFormError("habit-error", error.message);
  }
});

$("settings-habits").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-habit]");
  if (!button) return;
  const index = Number(button.dataset.removeHabit);
  safely(() => saveSettings({ ...settings, habits: settings.habits.filter((_, i) => i !== index) }));
});

$("goal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const goal = {
    name: $("goal-name").value.trim(),
    percent: Number($("goal-percent").value) || 0,
    detail: $("goal-detail").value.trim(),
  };
  if (!goal.name) return showFormError("goal-error", "Give the goal a name.");

  let goals;
  if (editingGoal === null) {
    if (settings.goals.length >= MAX_GOALS) {
      return showFormError("goal-error", `You can have up to ${MAX_GOALS} active goals.`);
    }
    goals = [...settings.goals, goal];
  } else {
    goals = settings.goals.map((g, i) => (i === editingGoal ? goal : g));
  }

  try {
    await saveSettings({ ...settings, goals });
    editingGoal = null;
    event.target.reset();
  } catch (error) {
    showFormError("goal-error", error.message);
  }
});

$("settings-goals").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-goal]");
  const remove = event.target.closest("[data-remove-goal]");
  if (edit) {
    // Put the goal into the form; saving the form replaces it.
    editingGoal = Number(edit.dataset.editGoal);
    const goal = settings.goals[editingGoal];
    $("goal-name").value = goal.name;
    $("goal-percent").value = goal.percent;
    $("goal-detail").value = goal.detail;
    $("goal-name").focus();
  } else if (remove) {
    const index = Number(remove.dataset.removeGoal);
    editingGoal = null;
    safely(() => saveSettings({ ...settings, goals: settings.goals.filter((_, i) => i !== index) }));
  }
});

// --- Export, import, delete ---

$("export-button").addEventListener("click", () => {
  safely(async () => {
    const backup = await api.exportData();
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `compass-${today}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    $("data-status").textContent = "Exported.";
  });
});

$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = ""; // so choosing the same file again still triggers this
  if (!file) return;
  showFormError("import-error", "");

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    return showFormError("import-error", "That file is not valid JSON. Nothing was changed.");
  }
  try {
    await api.importData(backup);
  } catch (error) {
    // The server changes nothing when an import fails.
    return showFormError("import-error", `${error.message} Nothing was changed.`);
  }
  settings = await api.getSettings();
  drawSettings();
  drawNav("settings");
  $("data-status").textContent = "Imported.";
});

$("delete-button").addEventListener("click", () => {
  // Clear the last answer, so closing with Esc never counts as "Delete".
  $("delete-dialog").returnValue = "";
  $("delete-dialog").showModal();
});

// The dialog's buttons close it; returnValue says which one was pressed.
$("delete-dialog").addEventListener("close", () => {
  if ($("delete-dialog").returnValue !== "confirm") return;
  safely(async () => {
    await api.deleteAll();
    // A timer still running would save a session into the emptied data.
    setTimer(IDLE);
    unsaved = [];
    store(UNSAVED_KEY, unsaved);
    settings = await api.getSettings();
    showOnboarding();
  });
});

// --- Midnight ---

// If the page stays open past midnight, switch to the new day when the user comes back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || todayKey() === today) return;
  safely(async () => {
    const onboarded = settings && settings.onboarded;
    // Save yesterday's note to yesterday first, and leave the box, so its
    // text can't be carried into the new day.
    if (onboarded && day) {
      await saveNote();
      $("note").blur();
    }
    today = todayKey();
    showTodayLabel();
    // No focus move: the user didn't ask to go anywhere.
    if (onboarded) await showPage(false);
  });
});

// --- Skip link ---

// Moves focus to the content without changing the address (which would mean "go Home").
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("app").focus();
});

startTicking();
safely(start);
safely(flushSessions);

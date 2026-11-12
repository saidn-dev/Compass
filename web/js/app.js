// The page's brain: loads data, draws it, reacts to clicks and typing.
// Data comes from api.js, HTML comes from render.js, and the elements are in index.html.

import * as api from "./api.js";
import {
  renderBrief, renderAreaCard, renderOnboarding, renderHabitGrid, renderGoals, renderTasks,
  renderTargetRows, renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
  renderStudyGoals,
  renderWorkQuestion, WORK_QUESTIONS, weekHoursText,
} from "./render.js";

const MAX_TASKS = 3;
const MAX_GOALS = 3;
const NOTE_SAVE_DELAY_MS = 500;

// Everything the page knows right now.
let areas = [];        // every module the server offers
let settings = null;   // the user's settings
let today = todayKey();
let day = null;        // today's logged data
let editingGoal = null; // index of the goal being edited in Settings, or null

const $ = (id) => document.getElementById(id);

// --- Small helpers ---

// Today's date as "YYYY-MM-DD" in the user's own time zone (not UTC).
function todayKey() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${date}`;
}

// Shows one view ("onboarding", "dashboard" or "settings") and hides the others.
function showView(name) {
  $("loading").hidden = true;
  $("onboarding-view").hidden = name !== "onboarding";
  $("dashboard-view").hidden = name !== "dashboard";
  $("settings-view").hidden = name !== "settings";
  // Highlight the matching nav button.
  const current = name === "settings" ? $("nav-settings") : $("nav-home");
  const other = name === "settings" ? $("nav-home") : $("nav-settings");
  current.setAttribute("aria-current", "page");
  other.removeAttribute("aria-current");
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
  if (settings.onboarded) {
    await loadDashboard();
    showView("dashboard");
  } else {
    showOnboarding();
  }
}

// --- Onboarding ---

// Every step, in order. Each is a <div id="onboarding-step-NAME"> in index.html.
const ALL_STEPS = ["welcome", "modules", "sleep", "study", "work", "habits", "goals"];
let onboardingStep = "welcome"; // the step showing right now

// Areas with their own onboarding page.
const OWN_PAGE = ["sleep", "study", "work"];

// The steps this user goes through: Sleep, Study and Work only if they picked them.
function onboardingSteps() {
  const picked = settings.modules;
  const steps = ["welcome", "modules"];
  if (picked.includes("sleep")) steps.push("sleep");
  if (picked.includes("study")) steps.push("study");
  if (picked.includes("work")) steps.push("work");
  return [...steps, "habits", "goals"];
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
  $("onboarding-study").innerHTML = renderStudyGoals(settings.study_goals, studyHours(), "onb");
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
async function finishOnboarding(goals = []) {
  const finished = { ...settings, onboarded: true };
  if (goals.length > 0) finished.goals = goals;
  settings = await api.putSettings(finished);
  await loadDashboard();
  showView("dashboard");
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
// Used by onboarding ("onb") and Settings ("set").
function changeStudyRows(event, container, prefix) {
  const add = event.target.closest("[data-add-study]");
  const remove = event.target.closest("[data-remove-study]");
  if (!add && !remove) return;
  const rows = readStudyRows(container);
  if (add) rows.push({ name: "", date: null });
  if (remove) rows.splice(Number(remove.dataset.removeStudy), 1);
  const hours = container.querySelector('input[name="study-hours"]').value;
  container.innerHTML = renderStudyGoals(rows, hours, prefix);
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
$("onboarding-habits-next").addEventListener("click", () => showOnboardingStep("goals"));
$("onboarding-skip-habits").addEventListener("click", () => showOnboardingStep("goals"));

// Goals: save any goals that have a name and finish. Rows left blank are ignored.
$("onboarding-goals-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const goals = [];
  for (const row of event.target.querySelectorAll(".goal-row")) {
    const name = row.querySelector('input[name="name"]').value.trim();
    const detail = row.querySelector('input[name="detail"]').value.trim();
    if (name) goals.push({ name, percent: 0, detail });
  }
  try {
    await finishOnboarding(goals);
  } catch (error) {
    showFormError("onboarding-goals-error", error.message);
  }
});

$("onboarding-skip-goals").addEventListener("click", () => safely(finishOnboarding));

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
function readStudyRows(container) {
  return [...container.querySelectorAll(".study-goal-row")].map((row) => {
    const date = row.querySelector('input[name="study-date"]');
    return {
      name: row.querySelector('input[name="study-name"]').value.trim(),
      date: date.value || null,
      badDate: date.validity.badInput,
    };
  });
}

// Checks the Study page: { goals, hours, error }. Fully blank rows are dropped.
function checkStudy(rows, hoursText) {
  const kept = rows.filter((g) => g.name || g.date || g.badDate);
  if (!kept.some((g) => g.name)) return { error: "Tell Compass what you're studying for." };
  if (kept.some((g) => !g.name)) return { error: "Give each goal a name, or remove it." };
  const half = kept.findIndex((g) => g.badDate);
  if (half !== -1) return { error: `Finish the date for goal ${rows.indexOf(kept[half]) + 1}, or clear it.` };
  const goals = kept.map(({ name, date }) => ({ name, date }));
  const hours = Number(hoursText);
  if (hoursText.trim() === "" || !(hours > 0 && hours <= 168)) {
    return { error: "Hours a week must be between 0 and 168." };
  }
  return { goals, hours };
}

// Settings with new study goals and hours. Keeps a saved "Stay under" rule,
// since the Study page has no choice for it.
function withStudy(oldSettings, goals, hours) {
  const saved = oldSettings.targets.find((t) => t.area_id === "study");
  const target = { area_id: "study", target: hours, mode: saved ? saved.mode : "up" };
  return { ...oldSettings, study_goals: goals, targets: mergeTargets(oldSettings.targets, [target]) };
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
  $("area-cards").innerHTML = dashboard.areas.map(renderAreaCard).join("");

  const completion = dashboard.habits.completion;
  $("habit-completion").textContent = completion === null ? "" : `${completion}% this week`;
  $("habit-grid").innerHTML = renderHabitGrid(dashboard.habits.grid, settings.habits);
  $("goals").innerHTML = renderGoals(settings.goals);
  $("tasks").innerHTML = renderTasks(day.tasks);

  fillLogForm();
  // Don't overwrite the note while the user is typing in it.
  if (document.activeElement !== $("note")) $("note").value = day.note;
}

// Saves changes to today, then redraws everything from the server's answer.
async function saveToday(changes) {
  day = { ...day, ...changes };
  day = await api.putDay(today, day);
  drawDashboard(await api.getDashboard(today));
}

// --- Daily log ---

// Shows only the fields for enabled modules and fills in today's saved numbers.
// Sleep has two versions: hours (a goal) or bed and wake times (a schedule).
function fillLogForm() {
  for (const field of $("log-form").querySelectorAll(".field[data-area]")) {
    const sleepVersion = field.dataset.sleep;
    const wrongSleepVersion = sleepVersion && (sleepVersion === "schedule") !== Boolean(settings.sleep_schedule);
    field.hidden = !settings.modules.includes(field.dataset.area) || wrongSleepVersion;
    for (const input of field.querySelectorAll("input")) {
      const saved = day[input.name];
      input.value = saved === null || saved === undefined ? "" : saved;
    }
    const gap = field.querySelector(".sleep-gap");
    if (gap) gap.textContent = gapText(day.bedtime, day.wake_time);
  }
  const workLabel = $("log-form").querySelector('label[for="log-work_hours"]');
  if (workLabel) workLabel.textContent = settings.work.kind === "job_hunting" ? "Job search" : "Paid work";
}

$("log-form").addEventListener("submit", (event) => {
  event.preventDefault();
  safely(async () => {
    const changes = {};
    for (const field of $("log-form").querySelectorAll(".field[data-area]")) {
      if (field.hidden) continue;
      for (const input of field.querySelectorAll("input")) {
        // Blank means "I don't know": send null, never 0.
        const blank = input.value.trim() === "";
        if (input.type === "time") changes[input.name] = blank ? null : input.value;
        else changes[input.name] = blank ? null : Number(input.value);
      }
    }
    // Only one sleep version counts: with times, the server works out the hours;
    // with hours, any old times are cleared so they can't override them.
    if (settings.modules.includes("sleep")) {
      if (settings.sleep_schedule) changes.sleep_hours = null;
      else Object.assign(changes, { bedtime: null, wake_time: null });
    }
    await saveToday(changes);
    $("log-status").textContent = `Saved ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  });
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

// --- Navigation ---

$("nav-home").addEventListener("click", () => {
  if (!settings.onboarded) return showOnboarding();
  safely(async () => {
    await loadDashboard();
    showView("dashboard");
  });
});

$("nav-settings").addEventListener("click", () => {
  drawSettings();
  showView("settings");
});

// --- Settings ---

function drawSettings() {
  $("settings-modules").innerHTML = renderOnboarding(areas, settings.modules);
  $("settings-sleep").innerHTML = settings.modules.includes("sleep") ? renderSleepChoice(settings, "set", false) : "";
  $("settings-targets").innerHTML = renderTargetRows(areas, settings, { prefix: "target", skip: OWN_PAGE });
  $("settings-targets-panel").hidden = !settings.modules.includes("sleep");
  const work = settings.modules.includes("work");
  $("settings-work-panel").hidden = !work;
  $("settings-work").innerHTML = work
    ? [0, 1, 2, 3, 4, 5].map((i) => renderWorkQuestion(i, settings.work, workHours(), "set")).join("")
    : "";
  const study = settings.modules.includes("study");
  $("settings-study-panel").hidden = !study;
  $("settings-study").innerHTML = study ? renderStudyGoals(settings.study_goals, studyHours(), "set") : "";
  $("settings-habits").innerHTML = renderHabitList(settings.habits);
  $("settings-goals").innerHTML = renderGoalList(settings.goals);
  for (const id of ["modules-error", "targets-error", "work-error", "study-error", "habit-error", "goal-error", "import-error"]) {
    showFormError(id, "");
  }
}

// Saves the whole settings object and redraws the Settings screen.
async function saveSettings(newSettings) {
  settings = await api.putSettings(newSettings);
  drawSettings();
}

// Modules: the same rules as onboarding (1 to 5, new ones get default targets).
$("modules-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settings = await api.postOnboarding(tickedModules(event.target));
    drawSettings();
    $("data-status").textContent = "";
  } catch (error) {
    showFormError("modules-error", error.message);
  }
});

// Targets, with Sleep's goal or schedule at the top when Sleep is enabled.
$("targets-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const targets = [];
  for (const row of $("settings-targets").querySelectorAll(".target-row")) {
    const target = Number(row.querySelector("input").value);
    if (!(target > 0)) {
      return showFormError("targets-error", "Each target must be a number above 0.");
    }
    targets.push({ area_id: row.dataset.area, target, mode: row.querySelector("select").value });
  }
  let newSettings = { ...settings, targets: mergeTargets(settings.targets, targets) };
  if ($("settings-sleep").querySelector(".sleep-choice")) {
    const choice = readSleepChoice(event.target);
    if (choice.error) return showFormError("targets-error", choice.error);
    newSettings = withSleepChoice(newSettings, choice);
  }
  try {
    await saveSettings(newSettings);
  } catch (error) {
    showFormError("targets-error", error.message);
  }
});

$("settings-study").addEventListener("click", (event) => {
  changeStudyRows(event, $("settings-study"), "set");
  $("study-status").textContent = "";
});

$("work-form").addEventListener("input", () => {
  $("work-status").textContent = "";
});

$("work-form").addEventListener("click", () => {
  $("work-status").textContent = "";
});

$("work-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  let next = settings;
  for (const [i, fieldset] of [...$("settings-work").querySelectorAll(".work-question")].entries()) {
    const { changes, hours, error } = readWorkAnswer(i, fieldset);
    if (error) return showFormError("work-error", error);
    next = withWork(next, changes, hours);
  }
  try {
    await saveSettings(next);
    $("work-status").textContent = "Saved";
  } catch (error) {
    showFormError("work-error", error.message);
  }
});

$("study-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const container = $("settings-study");
  const hoursText = container.querySelector('input[name="study-hours"]').value;
  const { goals, hours, error } = checkStudy(readStudyRows(container), hoursText);
  if (error) return showFormError("study-error", error);
  try {
    await saveSettings(withStudy(settings, goals, hours));
    $("study-status").textContent = "Saved";
  } catch (error) {
    showFormError("study-error", error.message);
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
    settings = await api.getSettings();
    showOnboarding();
  });
});

// --- Midnight ---

// If the page stays open past midnight, switch to the new day when the user comes back.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || todayKey() === today) return;
  today = todayKey();
  showTodayLabel();
  if (settings && settings.onboarded && !$("dashboard-view").hidden) safely(loadDashboard);
});

safely(start);

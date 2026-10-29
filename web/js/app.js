// The page's brain: loads data, draws it, reacts to clicks and typing.
// Data comes from api.js, HTML comes from render.js, and the elements are in index.html.

import * as api from "./api.js";
import {
  renderBrief, renderAreaCard, renderOnboarding, renderHabitGrid, renderGoals, renderTasks,
  renderTargetRows, renderHabitList, renderGoalList,
  gapText, renderSleepChoice, renderSleepSuggestion,
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
const ALL_STEPS = ["welcome", "modules", "sleep", "targets", "habits", "goals"];
let onboardingStep = "welcome"; // the step showing right now

// The steps this user goes through: Sleep only if they picked it, Targets only for
// the other areas. A fresh start (nothing picked yet) counts 5 steps.
function onboardingSteps() {
  const picked = settings.modules;
  const steps = ["welcome", "modules"];
  if (picked.includes("sleep")) steps.push("sleep");
  if (picked.length === 0 || picked.some((id) => id !== "sleep")) steps.push("targets");
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

function drawOnboardingTargets() {
  $("onboarding-targets").innerHTML = renderTargetRows(areas, settings, { prefix: "onb-target", skip: ["sleep"] });
}

function drawOnboardingHabits() {
  $("onboarding-habits").innerHTML = renderHabitList(settings.habits);
}

// Draws a step (if it has anything to draw) and shows it.
function goToStep(step) {
  if (step === "modules") drawOnboardingModules();
  if (step === "sleep") drawOnboardingSleep();
  if (step === "targets") drawOnboardingTargets();
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
  for (const id of ["onboarding-error", "onboarding-sleep-error", "onboarding-targets-error", "onboarding-habits-error", "onboarding-goals-error"]) {
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

// Areas: save the modules (new ones get default targets), then go on to Sleep or Targets.
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

// Targets (every area except Sleep): save them, keeping the sleep target, then show the habits.
$("onboarding-targets-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const targets = [];
  for (const row of $("onboarding-targets").querySelectorAll(".target-row")) {
    const target = Number(row.querySelector("input").value);
    if (!(target > 0)) {
      return showFormError("onboarding-targets-error", "Each target must be a number above 0.");
    }
    targets.push({ area_id: row.dataset.area, target, mode: row.querySelector("select").value });
  }
  try {
    settings = await api.putSettings({ ...settings, targets: mergeTargets(settings.targets, targets) });
    showFormError("onboarding-targets-error", "");
    goToStep(nextStep());
  } catch (error) {
    showFormError("onboarding-targets-error", error.message);
  }
});

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
  const steps = onboardingSteps();
  const previous = steps[steps.indexOf(onboardingStep) - 1];
  if (previous) goToStep(previous);
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
  $("settings-targets").innerHTML = renderTargetRows(areas, settings, { prefix: "target", skip: ["sleep"] });
  $("settings-habits").innerHTML = renderHabitList(settings.habits);
  $("settings-goals").innerHTML = renderGoalList(settings.goals);
  for (const id of ["modules-error", "targets-error", "habit-error", "goal-error", "import-error"]) {
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

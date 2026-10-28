// The page's brain: loads data, draws it, reacts to clicks and typing.
// Data comes from api.js, HTML comes from render.js, and the elements are in index.html.

import * as api from "./api.js";
import {
  renderBrief, renderAreaCard, renderOnboarding, renderHabitGrid, renderGoals, renderTasks,
  renderTargetRows, renderHabitList, renderGoalList,
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

// Onboarding has two steps: "modules" then "goals". Shows one, hides the other.
function showOnboardingStep(step) {
  $("onboarding-step-modules").hidden = step !== "modules";
  $("onboarding-step-goals").hidden = step !== "goals";
}

function showOnboarding() {
  $("onboarding-options").innerHTML = renderOnboarding(areas, []);
  $("onboarding-goals-form").reset();
  showFormError("onboarding-error", "");
  showFormError("onboarding-goals-error", "");
  showOnboardingStep("modules");
  showView("onboarding");
}

async function finishOnboarding() {
  await loadDashboard();
  showView("dashboard");
}

// Step 1: save the modules (this also marks onboarding as done), then ask about goals.
$("onboarding-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settings = await api.postOnboarding(tickedModules(event.target));
    showOnboardingStep("goals");
    $("onb-goal-name-0").focus();
  } catch (error) {
    showFormError("onboarding-error", error.message);
  }
});

// Step 2: save any goals that have a name. Rows left blank are ignored.
$("onboarding-goals-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const goals = [];
  for (const row of event.target.querySelectorAll(".goal-row")) {
    const name = row.querySelector('input[name="name"]').value.trim();
    const detail = row.querySelector('input[name="detail"]').value.trim();
    if (name) goals.push({ name, percent: 0, detail });
  }
  try {
    if (goals.length > 0) settings = await api.putSettings({ ...settings, goals });
    await finishOnboarding();
  } catch (error) {
    showFormError("onboarding-goals-error", error.message);
  }
});

$("onboarding-skip-goals").addEventListener("click", () => safely(finishOnboarding));

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
function fillLogForm() {
  for (const field of $("log-form").querySelectorAll(".field[data-area]")) {
    field.hidden = !settings.modules.includes(field.dataset.area);
    const input = field.querySelector("input");
    const saved = day[input.name];
    input.value = saved === null || saved === undefined ? "" : saved;
  }
}

$("log-form").addEventListener("submit", (event) => {
  event.preventDefault();
  safely(async () => {
    const changes = {};
    for (const field of $("log-form").querySelectorAll(".field[data-area]")) {
      if (field.hidden) continue;
      const input = field.querySelector("input");
      // Blank means "I don't know": send null, never 0.
      changes[input.name] = input.value.trim() === "" ? null : Number(input.value);
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
  $("settings-targets").innerHTML = renderTargetRows(areas, settings);
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
  try {
    await saveSettings({ ...settings, targets });
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

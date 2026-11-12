// Turns data into HTML text. No network, no clicks. All user text goes through escapeHtml.
// Each function returns a string; app.js puts it into the page.
// web/preview.html shows the HTML each one produces, and styles.css styles it.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_KEYS = { "On track": "on_track", "Behind": "behind", "No data": "no_data" };
const TREND_WORDS = { up: "Trending up", down: "Trending down", flat: "Steady", none: "Not enough data" };

// Makes text safe to put inside HTML: "<b>" shows as the text <b>, not bold.
export function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 7.5 -> "7.5", 8000 -> "8,000"
function formatNumber(n) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// "7.5 h", "1,200 h", "100%"
function withUnit(n, unit) {
  return unit === "%" ? `${formatNumber(n)}%` : `${formatNumber(n)} ${unit}`;
}

// "Target 7.5 h" for more-is-better, "Limit 100%" for stay-under.
function targetText(target, mode, unit) {
  return `${mode === "limit" ? "Limit" : "Target"} ${withUnit(target, unit)}`;
}

function progressBar(percent) {
  const width = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress" style="--progress: ${width}%"><span class="progress-bar"></span></div>`;
}

function capitalize(s) {
  const text = String(s);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function renderBrief(brief) {
  const sentences = brief.sentences
    .map((s) => `<p class="brief-text">${escapeHtml(s)}</p>`)
    .join("");
  if (brief.facts.length === 0) return `<div class="brief">${sentences}</div>`;

  const facts = brief.facts.map((f) => {
    if (f.kind === "bedtime") {
      return `<li>${escapeHtml(`Sleep: in bed late on ${f.value} of ${f.nights} nights (bedtime ${f.bedtime})`)}</li>`;
    }
    if (f.kind === "deadline") {
      const left = f.days_left < 0 ? "date passed"
        : f.days_left === 0 ? "today"
        : f.days_left === 1 ? "tomorrow"
        : `${f.days_left} days left`;
      return `<li>${escapeHtml(`Study: ${f.name}, ${f.date} (${left})`)}</li>`;
    }
    const name = capitalize(f.area_id);
    const when = f.date ? ` on ${f.date}` : "";
    const rule = f.mode === "limit" ? "limit" : "target";
    return `<li>${escapeHtml(name)}${escapeHtml(when)}: ${formatNumber(f.value)} (${rule} ${formatNumber(f.target)})</li>`;
  }).join("");

  return `<div class="brief">${sentences}
    <details class="brief-facts"><summary>Numbers used</summary><ul>${facts}</ul></details>
  </div>`;
}

// --- Scores: icons, rings and the hero ---

// Small line icons, drawn here so the page needs no icon files.
const ICONS = {
  home: `<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>`,
  sleep: `<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>`,
  study: `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 21H20"/>`,
  work: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>`,
  settings: `<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>`,
};

function icon(name, className) {
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.home}</svg>`;
}

// "Pay attention" -> "pay_attention", for styling by level.
function levelKey(label) {
  return String(label || "No data").toLowerCase().replaceAll(" ", "_");
}

// A score as the filled part of a line 100 long. No score fills nothing.
function filled(score) {
  return score === null || score === undefined ? 0 : Math.max(0, Math.min(100, Number(score)));
}

// The half-circle gauge behind a hero number.
function gauge(score) {
  const arc = "M 16 104 A 84 84 0 0 1 184 104";
  return `<svg class="gauge" aria-hidden="true" viewBox="0 0 200 112">
      <path class="gauge-track" d="${arc}" pathLength="100"/>
      <path class="gauge-fill" d="${arc}" pathLength="100" stroke-dasharray="${filled(score)} 100"/>
    </svg>`;
}

// The big block at the top of a page: gauge, small label, big number, headline.
// extra: more HTML under the headline (already escaped).
function hero({ kicker, number, unit = "", headline, score, level, status = "", extra = "" }) {
  const statusKey = status ? ` data-status="${STATUS_KEYS[status] || "no_data"}"` : "";
  return `<section class="hero" data-level="${levelKey(level)}"${statusKey} aria-label="${escapeHtml(kicker)}">
    ${gauge(score)}
    <p class="hero-kicker">${escapeHtml(kicker)}</p>
    <p class="hero-value"><span class="hero-number">${number}</span>${unit}</p>
    <h2 class="hero-headline">${escapeHtml(headline)}</h2>
    ${extra}
  </section>`;
}

// Home's hero: the overall score. score: { value, label, headline } from the dashboard.
export function renderToday(score) {
  const has = score.value !== null && score.value !== undefined;
  return hero({
    kicker: "Compass score",
    number: has ? formatNumber(score.value) : "-",
    headline: score.headline,
    score: score.value,
    level: score.label,
  });
}

// One module as a round chip on Home: icon, score and name. It links to the module's page.
export function renderScoreChip(area) {
  const has = area.score !== null && area.score !== undefined;
  const target = targetText(area.target, area.mode, area.unit);
  const label = has
    ? `${area.label}: score ${area.score}, ${area.score_label}. ${withUnit(area.value, area.unit)}, ${target}, ${area.status}`
    : `${area.label}: no data, ${target}`;
  return `<a class="score-chip" href="#/${escapeHtml(area.id)}" data-level="${levelKey(area.score_label)}" aria-label="${escapeHtml(label)}">
    <span class="score-chip-ring">
      <svg class="score-ring" aria-hidden="true" viewBox="0 0 64 64">
        <circle class="ring-track" cx="32" cy="32" r="29"/>
        <circle class="ring-fill" cx="32" cy="32" r="29" pathLength="100" stroke-dasharray="${filled(area.score)} 100"/>
      </svg>
      ${icon(area.id, "score-chip-icon")}
      <span class="score-chip-number">${has ? formatNumber(area.score) : "-"}</span>
    </span>
    <span class="score-chip-label">${escapeHtml(area.label)}</span>
  </a>`;
}

// areas: [{ id, label, unit, default_target, default_mode }]
export function renderOnboarding(areas, selectedIds) {
  const options = areas.map((a) => {
    const checked = selectedIds.includes(a.id) ? " checked" : "";
    return `<label class="module-option">
      <input type="checkbox" name="modules" value="${escapeHtml(a.id)}"${checked}>
      <span class="module-name">${escapeHtml(a.label)}</span>
      <span class="module-detail">${escapeHtml(targetText(a.default_target, a.default_mode, a.unit))}</span>
    </label>`;
  }).join("");

  return `<fieldset class="module-picker">
    <legend>Modules</legend>
    <p class="hint">Choose up to 3.</p>
    <div class="module-options">${options}</div>
  </fieldset>`;
}

// grid: [{ id, name, days: [{ date, done }] }]; done is true, false or null (a gap).
export function renderHabitGrid(grid, habits) {
  if (habits.length === 0 || grid.length === 0) {
    return `<p class="empty">No habits yet. Add one in Settings.</p>`;
  }

  const dates = grid[0].days.map((d) => d.date);
  const head = dates
    .map((date) => `<th scope="col">${DAY_NAMES[new Date(date + "T00:00").getDay()]}</th>`)
    .join("");

  const rows = grid.map((habit) => {
    const cells = habit.days.map((d) => {
      const dayName = DAY_NAMES[new Date(d.date + "T00:00").getDay()];
      const state = d.done === null ? "nothing logged" : d.done ? "done" : "not done";
      const gap = d.done === null ? " data-gap" : "";
      return `<td><button type="button" class="habit-cell" aria-pressed="${d.done === true}"${gap}
        data-habit="${escapeHtml(habit.id)}" data-date="${escapeHtml(d.date)}"
        aria-label="${escapeHtml(`${habit.name}, ${dayName}, ${state}`)}"></button></td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(habit.name)}</th>${cells}</tr>`;
  }).join("");

  return `<table class="habit-grid">
    <thead><tr><th scope="col"><span class="visually-hidden">Habit</span></th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function renderGoals(goals) {
  if (goals.length === 0) return `<p class="empty">No goals yet. Add one in Settings.</p>`;

  const items = goals.map((g) => `<li class="goal">
    <div class="goal-head">
      <span class="goal-name">${escapeHtml(g.name)}</span>
      <span class="goal-percent">${formatNumber(g.percent)}%</span>
    </div>
    ${progressBar(g.percent)}
    ${g.detail ? `<p class="goal-detail">${escapeHtml(g.detail)}</p>` : ""}
  </li>`).join("");

  return `<ul class="goal-list">${items}</ul>`;
}

export function renderTasks(tasks) {
  if (tasks.length === 0) return `<p class="empty">Nothing planned yet.</p>`;

  const items = tasks.map((t, i) => `<li class="task${t.done ? " is-done" : ""}">
    <label>
      <input type="checkbox" data-index="${i}"${t.done ? " checked" : ""}>
      <span class="task-text">${escapeHtml(t.text)}</span>
    </label>
  </li>`).join("");

  return `<ul class="task-list">${items}</ul>`;
}

// --- Settings screen ---

export function renderHabitList(habits) {
  if (habits.length === 0) return `<p class="empty">No habits yet.</p>`;
  const items = habits.map((h, i) => `<li>
    <span>${escapeHtml(h.name)}</span>
    <div class="button-row">
      <button type="button" class="btn btn-small" data-remove-habit="${i}">Remove</button>
    </div>
  </li>`).join("");
  return `<ul class="edit-list">${items}</ul>`;
}

export function renderGoalList(goals) {
  if (goals.length === 0) return `<p class="empty">No goals yet.</p>`;
  const items = goals.map((g, i) => `<li>
    <span>${escapeHtml(g.name)} (${formatNumber(g.percent)}%)</span>
    <div class="button-row">
      <button type="button" class="btn btn-small" data-edit-goal="${i}">Edit</button>
      <button type="button" class="btn btn-small" data-remove-goal="${i}">Remove</button>
    </div>
  </li>`).join("");
  return `<ul class="edit-list">${items}</ul>`;
}

// --- Sleep ---

const MINUTES_A_DAY = 24 * 60;

function minutesOf(hhmm) {
  const match = /^(\d\d):(\d\d)/.exec(hhmm || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Minutes from one time to the next, going past midnight if needed:
// "22:30", "06:30" -> 480. A blank time or equal times -> 0.
function gapMinutes(from, to) {
  const start = minutesOf(from);
  const end = minutesOf(to);
  if (start === null || end === null) return 0;
  return (end - start + MINUTES_A_DAY) % MINUTES_A_DAY;
}

// "22:30", "06:30" -> "= 8 h a night". Blank or equal times -> "".
// Only for showing; the server works out the hours that are saved.
export function gapText(bedtime, wakeTime) {
  const gap = gapMinutes(bedtime, wakeTime);
  return gap === 0 ? "" : `= ${formatNumber(gap / 60)} h a night`;
}

// Two labelled time inputs and the hours they make.
// idStart "onb-sleep" gives ids onb-sleep-bed / onb-sleep-wake; name "sleep" gives sleep-bed / sleep-wake.
function timeInputs(idStart, name, bed, wake, bedLabel, wakeLabel) {
  return `<div class="field">
      <label for="${idStart}-bed">${bedLabel}</label>
      <input id="${idStart}-bed" name="${name}-bed" type="time" value="${escapeHtml(bed)}">
    </div>
    <div class="field">
      <label for="${idStart}-wake">${wakeLabel}</label>
      <input id="${idStart}-wake" name="${name}-wake" type="time" value="${escapeHtml(wake)}">
    </div>
    <output class="sleep-gap">${escapeHtml(gapText(bed, wake))}</output>`;
}

function hoursInput(id, name, hours) {
  return `<div class="field">
      <label for="${id}">Hours a night</label>
      <div class="input-unit">
        <input id="${id}" name="${name}" type="number" inputmode="decimal" min="0" max="24" step="0.25" value="${escapeHtml(hours)}">
        <span class="unit">h</span>
      </div>
    </div>`;
}

// The Sleep question: a goal (hours), a schedule (bed and wake times), or, in onboarding,
// "Let's work it out". Opens on the schedule if one is saved, otherwise on the goal.
// settings: { targets, sleep_schedule }; prefix keeps ids unique ("onb" or "set").
export function renderSleepChoice(settings, prefix, withHelp) {
  const schedule = settings.sleep_schedule;
  const mode = schedule ? "schedule" : "goal";
  const saved = settings.targets.find((t) => t.area_id === "sleep");
  const id = escapeHtml(prefix);

  const radio = (value, text) => `<div class="sleep-option">
      <input type="radio" id="${id}-sleep-mode-${value}" name="sleep-mode" value="${value}"${value === mode ? " checked" : ""}>
      <label for="${id}-sleep-mode-${value}">${text}</label>
    </div>`;
  const hidden = (value) => (value === mode ? "" : " hidden");

  return `<fieldset class="sleep-choice">
    <legend>${withHelp ? "Do you already know what you want from your sleep?" : "Sleep"}</legend>
    ${radio("goal", "I have a sleep goal")}
    <div class="sleep-panel" data-mode="goal"${hidden("goal")}>
      ${hoursInput(`${id}-sleep-hours`, "sleep-hours", saved ? saved.target : "")}
    </div>
    ${radio("schedule", "I have a sleep schedule")}
    <div class="sleep-panel sleep-times" data-mode="schedule"${hidden("schedule")}>
      ${timeInputs(`${id}-sleep`, "sleep", schedule ? schedule.bedtime : "", schedule ? schedule.wake_time : "", "In bed", "Up")}
    </div>
    ${withHelp ? radio("help", "Let's work it out") : ""}
  </fieldset>`;
}

// The answer to "Let's work it out", which the user can still change.
// s: { hours, range, bedtime, wake_time, tips, notes } from the server.
export function renderSleepSuggestion(s) {
  const choice = s.bedtime
    ? `<div class="sleep-times">${timeInputs("onb-sugg", "sugg", s.bedtime, s.wake_time, "In bed by", "Up at")}</div>`
    : hoursInput("onb-sugg-hours", "sugg-hours", s.hours);
  const tips = s.tips.length > 0
    ? `<ul class="sleep-tips">${s.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : "";
  const notes = s.notes.map((n) => `<p class="sleep-note">${escapeHtml(n)}</p>`).join("");

  return `<div class="sleep-suggestion">
    <h3>Your suggestion</h3>
    <p class="hint">Change anything before you go on.</p>
    ${choice}
    <p>Usual range: ${escapeHtml(s.range)} a night.</p>
    ${tips}${notes}
    <p class="hint">General guidance, not medical advice.</p>
  </div>`;
}

// --- Study ---

const MAX_STUDY_GOALS = 5;

// The Study page: one row per goal (name and optional date), "+ Add another" up to 5,
// then hours a week for all study. No goals yet draws one empty row.
// goals: [{ name, date }]; prefix keeps ids unique ("onb" now, the Study page later).
export function renderStudyGoals(goals, hours, prefix) {
  const rows = goals.length > 0 ? goals : [{ name: "", date: null }];
  const id = escapeHtml(prefix);

  const items = rows.map((g, i) => {
    const n = i + 1;
    const remove = rows.length > 1
      ? `<button type="button" class="btn btn-small" data-remove-study="${i}">Remove<span class="visually-hidden"> goal ${n}</span></button>`
      : "";
    return `<div class="study-goal-row" data-index="${i}">
      <div class="field">
        <label for="${id}-study-name-${i}">Goal ${n}</label>
        <input id="${id}-study-name-${i}" name="study-name" type="text" maxlength="100" autocomplete="off" value="${escapeHtml(g.name)}">
      </div>
      <div class="field">
        <label for="${id}-study-date-${i}">Date<span class="visually-hidden"> for goal ${n}</span></label>
        <input id="${id}-study-date-${i}" name="study-date" type="date" value="${escapeHtml(g.date || "")}">
      </div>
      ${remove}
    </div>`;
  }).join("");

  const add = rows.length < MAX_STUDY_GOALS
    ? `<button type="button" class="btn" data-add-study>+ Add another</button>`
    : `<p class="hint">Up to 5 goals.</p>`;

  return `<fieldset class="study-goals">
    <legend>What are you studying for?</legend>
    ${items}
    ${add}
    <p class="hint">Leave the date blank if there isn't one.</p>
  </fieldset>
  <div class="field study-hours">
    <label for="${id}-study-hours">Hours a week for all your studying</label>
    <div class="input-unit">
      <input id="${id}-study-hours" name="study-hours" type="number" inputmode="decimal" min="0" max="168" step="any" value="${escapeHtml(hours)}">
      <span class="unit">h</span>
    </div>
  </div>`;
}

// --- Work ---

export const WORK_QUESTIONS = [
  "What best describes your work right now?",
  "What's your role or main kind of work?",
  "Which days and hours do you usually work?",
  "When do you do your best focused work?",
  "What's the one work goal that matters most in the next 3 months?",
  "What usually gets in the way of your work week?",
];

// Same values as the server; the server is the one that enforces them.
const WORK_KINDS = ["employed", "freelance", "student", "job_hunting", "other"];
const WORK_KIND_LABELS = ["Employed", "Freelance or self-employed", "Student who works", "Looking for work", "Other"];
const WORK_FOCUS = ["morning", "afternoon", "evening", "varies"];
const WORK_FOCUS_LABELS = ["Morning", "Afternoon", "Evening", "It varies"];
const DERAILERS = ["priorities", "procrastination", "interruptions", "energy", "projects", "other"];
const DERAILER_LABELS = ["Unclear priorities", "Putting things off", "Interruptions", "Low energy", "Too many projects", "Something else"];
const WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 5 days, "09:00", "17:00" -> "= 40 h a week". No days, a blank time or equal times -> "".
// Only for showing; the server works out the hours that are saved.
export function weekHoursText(dayCount, start, end) {
  const gap = gapMinutes(start, end);
  return !dayCount || gap === 0 ? "" : `= ${formatNumber((gap * dayCount) / 60)} h a week`;
}

function workChoices(type, name, id, values, labels, checkedFn) {
  return values.map((value, i) => `<div class="work-option">
      <input type="${type}" id="${id}-work-${name}-${value}" name="work-${name}" value="${value}"${checkedFn(value) ? " checked" : ""}>
      <label for="${id}-work-${name}-${value}">${labels[i]}</label>
    </div>`).join("");
}

function workTextField(id, name, label, hint, value) {
  return `<div class="field">
      <label for="${id}-work-${name}">${label}</label>
      <input id="${id}-work-${name}" name="work-${name}" type="text" maxlength="100" autocomplete="off" aria-describedby="${id}-work-${name}-hint" value="${escapeHtml(value || "")}">
      <p class="hint" id="${id}-work-${name}-hint">${hint}</p>
    </div>`;
}

function workSchedule(work, hours, id) {
  const schedule = work.schedule;
  const days = schedule ? schedule.days : [];
  const start = schedule ? schedule.start : "";
  const end = schedule ? schedule.end : "";
  const varies = Boolean(work.hours_vary);

  const toggles = WORK_DAYS.map((name, i) => `<button type="button" class="day-toggle" data-day="${i}" aria-pressed="${days.includes(i)}">${name}</button>`).join("");

  return `<div class="work-schedule"${varies ? " hidden" : ""}>
      <span class="field-label" id="${id}-work-days-label"><span class="visually-hidden">Days</span></span>
      <div class="day-toggles" role="group" aria-labelledby="${id}-work-days-label">${toggles}</div>
      <div class="field">
        <label for="${id}-work-start">From</label>
        <input id="${id}-work-start" name="work-start" type="time" value="${escapeHtml(start)}">
      </div>
      <div class="field">
        <label for="${id}-work-end">To</label>
        <input id="${id}-work-end" name="work-end" type="time" value="${escapeHtml(end)}">
      </div>
      <output class="work-week">${escapeHtml(weekHoursText(days.length, start, end))}</output>
    </div>
    <div class="work-option">
      <input type="checkbox" id="${id}-work-varies" name="work-varies"${varies ? " checked" : ""}>
      <label for="${id}-work-varies">It varies</label>
    </div>
    <div class="work-varies-panel"${varies ? "" : " hidden"}>
      <div class="field">
        <label for="${id}-work-hours">Hours a week</label>
        <div class="input-unit">
          <input id="${id}-work-hours" name="work-hours" type="number" inputmode="decimal" min="0" max="168" step="any" value="${escapeHtml(hours)}">
          <span class="unit">h</span>
        </div>
      </div>
    </div>`;
}

// One Work question as a fieldset, filled in from the saved work profile.
// hours: the saved Work target, for "It varies"; prefix keeps ids unique ("onb" or "set").
export function renderWorkQuestion(index, work, hours, prefix, { hideLegend = false } = {}) {
  const id = escapeHtml(prefix);
  const controls = [
    () => workChoices("radio", "kind", id, WORK_KINDS, WORK_KIND_LABELS, (v) => work.kind === v),
    () => workTextField(id, "role", "Role or main kind of work", "For example: Software developer, Nurse, Barista.", work.role),
    () => workSchedule(work, hours, id),
    () => workChoices("radio", "focus", id, WORK_FOCUS, WORK_FOCUS_LABELS, (v) => work.focus === v),
    () => workTextField(id, "goal", "Work goal", "For example: Fix 3 bugs.", work.goal),
    () => workChoices("checkbox", "derailer", id, DERAILERS, DERAILER_LABELS, (v) => (work.derailers || []).includes(v)),
  ][index]();

  return `<fieldset class="work-question" data-work="${index}">
    <legend${hideLegend ? ' class="visually-hidden"' : ""}>${escapeHtml(WORK_QUESTIONS[index])}</legend>
    ${controls}
  </fieldset>`;
}

// --- Nav and module pages ---

// The nav's links: Home, the modules that are switched on, Settings.
// areas: [{ id, label }]; current: the page showing ("home", a module id or "settings").
export function renderNav(areas, modules, current) {
  const link = (page, href, text, extra = "") =>
    `<a class="nav-link${extra}" href="${href}"${page === current ? ' aria-current="page"' : ""}>${icon(page, "nav-icon")}<span>${escapeHtml(text)}</span></a>`;
  const shown = areas.filter((a) => modules.includes(a.id));
  const label = shown.length > 0 ? `<p class="nav-label">Modules</p>` : "";
  const moduleLinks = shown.map((a) => link(a.id, `#/${escapeHtml(a.id)}`, a.label)).join("");
  return `${link("home", "#/", "Home")}${label}${moduleLinks}${link("settings", "#/settings", "Settings", " nav-settings")}`;
}

// "2026-11-06" -> "Fri 6"; today's own date -> "Today".
export function dayLabel(dateKey, todayKey) {
  if (dateKey === todayKey) return "Today";
  const date = new Date(dateKey + "T00:00");
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}`;
}

// One number input with its unit, for the module page's log form.
function logNumber(name, label, step, value) {
  return `<div class="field">
      <label for="mod-log-${name}">${label}</label>
      <div class="input-unit">
        <input id="mod-log-${name}" name="${name}" type="number" inputmode="decimal" min="0" max="24" step="${step}" value="${escapeHtml(value)}">
        <span class="unit">h</span>
      </div>
    </div>`;
}

function logTime(name, label, value) {
  return `<div class="field">
      <label for="mod-log-${name}">${label}</label>
      <input id="mod-log-${name}" name="${name}" type="time" value="${escapeHtml(value)}">
    </div>`;
}

// Today's log fields for one module. The names match the Home log form.
function moduleLogFields(areaId, day, settings) {
  if (areaId === "sleep" && settings.sleep_schedule) {
    return `<div class="sleep-times">
      ${logTime("bedtime", "In bed", day.bedtime)}
      ${logTime("wake_time", "Up", day.wake_time)}
      <output class="sleep-gap">${escapeHtml(gapText(day.bedtime, day.wake_time))}</output>
    </div>`;
  }
  if (areaId === "sleep") return logNumber("sleep_hours", "Sleep", "0.1", day.sleep_hours);
  if (areaId === "study") return logNumber("study_hours", "Study", "0.25", day.study_hours);
  const label = settings.work.kind === "job_hunting" ? "Job search" : "Paid work";
  return logNumber("work_hours", label, "0.25", day.work_hours);
}

// The last 7 days as bars. Each bar's height is its share of the biggest value
// (or of the daily target, if that is bigger); a line marks the daily target.
function weekBars(area, dates, today) {
  const logged = area.series.filter((v) => v !== null && v !== undefined);
  const top = Math.max(Number(area.daily_target) || 0, ...logged, 0) || 1;
  const percent = (n) => `${Math.round((n / top) * 1000) / 10}%`;

  const bars = dates.map((date, i) => {
    const value = area.series[i];
    const gap = value === null || value === undefined;
    const label = dayLabel(date, today);
    const said = `${label}: ${gap ? "not logged" : withUnit(value, area.unit)}`;
    return `<li class="week-bar"${gap ? " data-gap" : ""}${date === today ? " data-today" : ""}>
        <span class="week-bar-value" aria-hidden="true">${gap ? "-" : formatNumber(value)}</span>
        <span class="week-bar-track" aria-hidden="true"><span class="week-bar-fill" style="--height: ${gap ? "0%" : percent(value)}"></span></span>
        <span class="week-bar-day" aria-hidden="true">${label.split(" ")[0]}</span>
        <span class="visually-hidden">${escapeHtml(said)}</span>
      </li>`;
  }).join("");

  const target = area.daily_target ? ` style="--target: ${percent(area.daily_target)}"` : "";
  return `<ol class="week-bars"${target}>${bars}</ol>`;
}

// What went into this week's score, each with a small meter.
function contributorList(contributors) {
  const items = contributors.map((c) => `<li class="contributor" data-level="${levelKey(c.level)}">
      <span class="contributor-label">${escapeHtml(c.label)}</span>
      <span class="contributor-level">${escapeHtml(c.level)}</span>
      <span class="contributor-text">${escapeHtml(c.text)}</span>
      <span class="meter" aria-hidden="true" style="--value: ${filled(c.score)}%"><span class="meter-fill"></span></span>
    </li>`).join("");
  return `<ul class="contributors">${items}</ul>`;
}

// A module's page: the hero (this week), today's log, the last 7 days, contributors and details.
// area: the module's entry from the dashboard; dates: the 7 days in area.series;
// day: what is logged today; settings: for the sleep schedule and the work type.
export function renderModulePage(area, dates, today, day, settings) {
  const id = escapeHtml(area.id);
  const hasValue = area.value !== null && area.value !== undefined;
  const hasScore = area.score !== null && area.score !== undefined;
  const target = targetText(area.target, area.mode, area.unit);
  const trend = TREND_WORDS[area.trend]
    ? `<p class="trend" data-trend="${escapeHtml(area.trend)}">${TREND_WORDS[area.trend]}</p>`
    : "";
  const lines = area.details.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  const top = hero({
    kicker: area.period,
    number: hasValue ? formatNumber(area.value) : "-",
    unit: hasValue ? `<span class="unit">${escapeHtml(area.unit)}</span>` : "",
    headline: area.headline,
    score: area.score,
    level: area.score_label,
    status: area.status,
    extra: `<p class="hero-meta">
      <span class="status">${escapeHtml(area.status)}</span>
      <span>${escapeHtml(target)}</span>
      ${hasScore ? `<span>Score ${formatNumber(area.score)}</span>` : ""}
    </p>
    ${trend}`,
  });

  return `${top}
  <section class="panel module-log" aria-labelledby="module-log-title">
    <h2 id="module-log-title">${area.id === "sleep" ? "Log last night" : "Log today"}</h2>
    <form id="module-log-form" data-area="${id}" novalidate>
      ${moduleLogFields(area.id, day, settings)}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <p class="save-status" id="module-log-status" role="status" aria-live="polite"></p>
      </div>
    </form>
  </section>
  <section class="panel module-days" aria-labelledby="module-days-title">
    <h2 id="module-days-title">Last 7 days</h2>
    ${weekBars(area, dates, today)}
  </section>
  <section class="panel module-contributors" aria-labelledby="module-contributors-title">
    <h2 id="module-contributors-title">Contributors</h2>
    ${contributorList(area.contributors || [])}
  </section>
  <section class="panel module-details" id="module-details" aria-labelledby="module-details-title">
    <h2 id="module-details-title">${escapeHtml(area.details.title)}</h2>
    ${lines}
    <div class="form-actions">
      <button type="button" class="btn" id="module-edit">Edit ${escapeHtml(area.label.toLowerCase())}</button>
    </div>
  </section>`;
}

// The form that replaces a module's details when Edit is pressed.
// hours: the saved Study or Work hours a week (not used for Sleep).
export function renderModuleEdit(areaId, settings, hours) {
  let fields;
  if (areaId === "sleep") {
    fields = renderSleepChoice(settings, "mod", false);
  } else if (areaId === "study") {
    fields = `<div id="module-study">${renderStudyGoals(settings.study_goals, hours, "mod")}</div>`;
  } else {
    fields = WORK_QUESTIONS.map((_, i) => renderWorkQuestion(i, settings.work, hours, "mod")).join("");
  }
  return `<form id="module-edit-form" data-area="${escapeHtml(areaId)}" novalidate>
    ${fields}
    <p class="form-error" id="module-edit-error" role="alert" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Save</button>
      <button type="button" class="btn btn-ghost" id="module-edit-cancel">Cancel</button>
    </div>
  </form>`;
}

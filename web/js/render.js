// Turns data into HTML text. No network, no clicks. All user text goes through escapeHtml.
// Each function returns a string; app.js puts it into the page.
// web/preview.html shows the HTML each one produces, and styles.css styles it.

import { dateHint, parseDate } from "./dates.js";
import { IDLE, LENGTHS, SESSIONS_A_ROUND, countdownText, isPaused, remainingMs, ringShare } from "./timer.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
  insights: `<path d="M5 20V11M12 20V4M19 20v-6"/>`,
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

// The level word and, next to it, the top reason: "Fair · Mostly hours: 4 of 10 h this week".
// The reason is the "why" behind the number, shown without a tap.
function heroStatus(level, reason) {
  if (!level || level === "No data") return "";
  const why = reason ? `<span class="hero-reason">${escapeHtml(reason)}</span>` : "";
  return `<p class="hero-status"><span class="status">${escapeHtml(level)}</span>${why}</p>`;
}

// The big block at the top of a page: gauge, small label, big number, headline,
// then the level word with its reason.
// extra: more HTML under that (already escaped).
// label: what a screen reader calls the block; the kicker when not given.
function hero({ kicker, label = kicker, number, unit = "", headline, score, level, reason = null, extra = "" }) {
  return `<section class="hero" data-level="${levelKey(level)}" aria-label="${escapeHtml(label)}">
    ${gauge(score)}
    <p class="hero-kicker">${escapeHtml(kicker)}</p>
    <p class="hero-value"><span class="hero-number">${number}</span>${unit}</p>
    <h2 class="hero-headline">${escapeHtml(headline)}</h2>
    ${heroStatus(level, reason)}
    ${extra}
  </section>`;
}

// Under a hero: "Learning your rhythm · day 4 of 14" for the first two weeks, then the last
// 14 days against your usual range. learning: text or null; usual: { place, text } or null.
export function baselineLine(learning, usual) {
  if (learning) return `<p class="hero-usual" data-place="learning">${escapeHtml(learning)}</p>`;
  if (!usual) return "";
  return `<p class="hero-usual" data-place="${escapeHtml(usual.place)}">${escapeHtml(usual.text)}</p>`;
}

// Home's hero: the overall score. score: { value, label, headline, reason } from the dashboard.
// extra: more HTML under it (already escaped), such as the learning line.
export function renderToday(score, extra = "") {
  const has = score.value !== null && score.value !== undefined;
  return hero({
    kicker: "Compass score",
    number: has ? formatNumber(score.value) : "-",
    headline: score.headline,
    score: score.value,
    level: score.label,
    reason: score.reason,
    extra,
  });
}

// One module as a round chip on Home: icon, score and name. It links to the module's page.
export function renderScoreChip(area) {
  const has = area.score !== null && area.score !== undefined;
  const target = targetText(area.target, area.mode, area.unit);
  const label = has
    ? `${area.label}: score ${area.score}, ${area.score_label}. ${withUnit(area.value, area.unit)}, ${target}`
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

const DATE_EXAMPLES = "Try “in 12 days”, “next Monday”, “5 Dec” or 2026-12-05.";
const MAX_STEPS = 10;

// The line under a goal's date box: the date it was read as, or how to write one.
// "" while the box is blank or when today isn't known.
export function studyDateHint(text, today) {
  if (!today || String(text ?? "").trim() === "") return "";
  const read = parseDate(text, today);
  return read ? dateHint(read.date, today) : `Can't read that date. ${DATE_EXAMPLES}`;
}

// The Study form: one row per goal (name, date in words, hours it needs), "+ Add another"
// up to 5, then hours a week for all study. No goals yet draws one empty row.
// goals: saved goals or rows read back from the form ({ dateText, stepsText } keep what was typed);
// prefix keeps ids unique ("onb" onboarding, "mod" the Study page); today: for the date hints;
// withSteps: a Steps box per goal (the Study page only, onboarding stays short).
export function renderStudyGoals(goals, hours, prefix, today = null, withSteps = false) {
  const rows = goals.length > 0 ? goals : [{ name: "", date: null }];
  const id = escapeHtml(prefix);

  const items = rows.map((g, i) => {
    const n = i + 1;
    const dateText = g.dateText ?? g.date ?? "";
    const hint = studyDateHint(dateText, today);
    const remove = rows.length > 1
      ? `<button type="button" class="btn btn-small" data-remove-study="${i}">Remove<span class="visually-hidden"> goal ${n}</span></button>`
      : "";
    const stepsText = g.stepsText ?? (g.steps || []).map((s) => s.text).join("\n");
    const steps = withSteps
      ? `<div class="field study-steps">
        <label for="${id}-study-steps-${i}">Steps<span class="visually-hidden"> for goal ${n}</span>, one a line</label>
        <textarea id="${id}-study-steps-${i}" name="study-steps" rows="2">${escapeHtml(stepsText)}</textarea>
        <p class="hint">Up to ${MAX_STEPS}. Tick them off on the Study page.</p>
      </div>`
      : "";
    return `<div class="study-goal-row" data-index="${i}">
      <div class="field">
        <label for="${id}-study-name-${i}">Goal ${n}</label>
        <input id="${id}-study-name-${i}" name="study-name" type="text" maxlength="100" autocomplete="off" value="${escapeHtml(g.name)}">
      </div>
      <div class="field">
        <label for="${id}-study-date-${i}">Date<span class="visually-hidden"> for goal ${n}</span></label>
        <input id="${id}-study-date-${i}" name="study-date" type="text" autocomplete="off" placeholder="in 12 days" aria-describedby="${id}-study-date-hint-${i}" value="${escapeHtml(dateText)}">
        <p class="hint date-hint" id="${id}-study-date-hint-${i}" aria-live="polite">${escapeHtml(hint)}</p>
      </div>
      <div class="field field-narrow">
        <label for="${id}-study-goal-hours-${i}">Hours it needs<span class="visually-hidden"> for goal ${n}</span></label>
        <div class="input-unit">
          <input id="${id}-study-goal-hours-${i}" name="study-goal-hours" type="number" inputmode="decimal" min="0" max="1000" step="any" value="${escapeHtml(g.hours ?? "")}">
          <span class="unit">h</span>
        </div>
      </div>
      ${remove}
      ${steps}
    </div>`;
  }).join("");

  const add = rows.length < MAX_STUDY_GOALS
    ? `<button type="button" class="btn" data-add-study>+ Add another</button>`
    : `<p class="hint">Up to 5 goals.</p>`;

  return `<fieldset class="study-goals">
    <legend>What are you studying for?</legend>
    ${items}
    ${add}
    <p class="hint">Write the date the way you'd say it, or leave it blank if there isn't one. With a date and the hours it needs, the Study page shows your pace; pick the goal as the timer's task to count sessions toward it.</p>
  </fieldset>
  <div class="field study-hours">
    <label for="${id}-study-hours">Hours a week for all your studying</label>
    <div class="input-unit">
      <input id="${id}-study-hours" name="study-hours" type="number" inputmode="decimal" min="0" max="168" step="any" value="${escapeHtml(hours)}">
      <span class="unit">h</span>
    </div>
  </div>`;
}

// --- Onboarding: the starting point, its projection, and the first session ---

const FOCUS_NOUNS = { study: "study", work: "work" };
const START_QUESTIONS = {
  study: "Honestly, how many hours do you study in a normal week right now?",
  work: "Honestly, how many hours do you work in a normal week right now?",
};

// One honest estimate per focus module (Study, Work). start: the saved starting point or null.
export function renderStartingPoint(modules, start) {
  return modules.filter((id) => START_QUESTIONS[id]).map((id) => {
    const value = start ? start[`${id}_hours`] : null;
    return `<div class="field">
      <label for="onb-start-${id}">${START_QUESTIONS[id]}</label>
      <div class="input-unit">
        <input id="onb-start-${id}" name="${id}_hours" type="number" inputmode="decimal" min="0" max="168" step="any" value="${escapeHtml(value ?? "")}">
        <span class="unit">h</span>
      </div>
    </div>`;
  }).join("");
}

// 7 h a week -> about 360 h a year (to the nearest 10).
function yearly(hoursAWeek) {
  return formatNumber(Math.round((hoursAWeek * 52) / 10) * 10);
}

// The projection: a week's estimate as a year, and what the target changes. Kind, not a doom number.
// estimates: { study: 5, work: null }; targets: [{ area_id, target, mode }].
export function renderProjection(estimates, targets) {
  const lines = Object.entries(estimates).filter(([id, e]) => FOCUS_NOUNS[id] && e !== null && e !== undefined).map(([id, e]) => {
    const t = targets.find((x) => x.area_id === id);
    const noun = FOCUS_NOUNS[id];
    let line = `At about ${formatNumber(e)} h a week, that's about ${yearly(e)} h of ${noun} a year.`;
    if (t && t.mode === "limit") {
      line += e > t.target
        ? ` Keeping to your limit of ${formatNumber(t.target)} h a week gives back about ${yearly(e - t.target)} h a year.`
        : ` Your limit is ${formatNumber(t.target)} h a week, and you're already within it.`;
    } else if (t) {
      const gap = t.target - e;
      const weeks = Math.round((gap * 52) / 40);
      line += gap <= 0
        ? ` That already meets your target of ${formatNumber(t.target)} h a week; Compass will help you keep it steady.`
        : ` Your target of ${formatNumber(t.target)} h a week adds about ${yearly(gap)} h a year`
          + (weeks >= 1 ? `, the same as ${weeks} full 40-hour week${weeks === 1 ? "" : "s"}.` : ".");
    }
    return `<p>${escapeHtml(line)}</p>`;
  });
  if (lines.length === 0) return "";
  return `<div class="projection">
    <p class="projection-label">Estimate</p>
    ${lines.join("")}
    <p class="hint">Worked out from your own numbers, 52 weeks a year. Compass checks it against what you really log from here on.</p>
  </div>`;
}

// The last onboarding step: which module and how long. modules: the focus modules picked.
export function renderFirstSession(modules) {
  const focus = modules.filter((id) => FOCUS_NOUNS[id]);
  const areas = focus.map((id, i) => `<label class="mood-option">
      <input type="radio" name="session-area" value="${id}"${i === 0 ? " checked" : ""}>
      <span>${id === "study" ? "Study" : "Work"}</span>
    </label>`).join("");
  const lengths = [15, 25].map((n) => `<label class="mood-option">
      <input type="radio" name="session-minutes" value="${n}"${n === 25 ? " checked" : ""}>
      <span>${n}<span class="visually-hidden"> minutes</span></span>
    </label>`).join("");
  const which = focus.length > 1
    ? `<fieldset class="mood"><legend>What for</legend><div class="mood-options">${areas}</div></fieldset>`
    : `<input type="hidden" name="session-area" value="${escapeHtml(focus[0] || "study")}">`;
  return `${which}
    <fieldset class="mood">
      <legend>Minutes</legend>
      <div class="mood-options">${lengths}</div>
    </fieldset>`;
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

// The nav's links: Home, the modules that are switched on, Insights, Settings.
// areas: [{ id, label }]; current: the page showing ("home", a module id or "settings").
export function renderNav(areas, modules, current) {
  const link = (page, href, text, extra = "") =>
    `<a class="nav-link${extra}" href="${href}"${page === current ? ' aria-current="page"' : ""}>${icon(page, "nav-icon")}<span>${escapeHtml(text)}</span></a>`;
  const shown = areas.filter((a) => modules.includes(a.id));
  const label = shown.length > 0 ? `<p class="nav-label">Modules</p>` : "";
  const moduleLinks = shown.map((a) => link(a.id, `#/${escapeHtml(a.id)}`, a.label)).join("");
  return `${link("home", "#/", "Home")}${label}${moduleLinks}${link("insights", "#/insights", "Insights", " nav-insights")}${link("settings", "#/settings", "Settings", " nav-settings")}`;
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

// Bars for a run of values. Each bar's height is its share of the biggest value (or of
// the target, if that is bigger); a dashed line marks the target.
// items: [{ value, label, said, today }]; said is what a screen reader hears.
// usual: { low, high } shades your usual range behind the bars (the 12-week chart only).
function barChart(items, target, { itemClass = "week-bar", listClass = "week-bars", usual = null } = {}) {
  const logged = items.map((item) => item.value).filter((v) => v !== null && v !== undefined);
  const top = Math.max(Number(target) || 0, ...logged, usual ? usual.high : 0, 0) || 1;
  const percent = (n) => `${Math.round((n / top) * 1000) / 10}%`;

  const bars = items.map((item) => {
    const gap = item.value === null || item.value === undefined;
    return `<li class="${itemClass}"${gap ? " data-gap" : ""}${item.today ? " data-today" : ""}>
        <span class="week-bar-value" aria-hidden="true">${gap ? "-" : formatNumber(item.value)}</span>
        <span class="week-bar-track" aria-hidden="true"><span class="week-bar-fill" style="--height: ${gap ? "0%" : percent(item.value)}"></span></span>
        <span class="week-bar-day" aria-hidden="true">${escapeHtml(item.label)}</span>
        <span class="visually-hidden">${escapeHtml(item.said)}</span>
      </li>`;
  }).join("");

  const styles = [];
  if (target) styles.push(`--target: ${percent(target)}`);
  if (usual) styles.push(`--usual-low: ${percent(Math.min(usual.low, top))}`, `--usual-high: ${percent(Math.min(usual.high, top))}`);
  const line = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
  return `<ol class="${listClass}"${usual ? " data-usual" : ""}${line}>${bars}</ol>`;
}

// The last 7 days as bars, against one day's share of the target.
function weekBars(area, dates, today) {
  const items = dates.map((date, i) => {
    const value = area.series[i];
    const gap = value === null || value === undefined;
    const label = dayLabel(date, today);
    return { value, label: label.split(" ")[0], today: date === today,
      said: `${label}: ${gap ? "not logged" : withUnit(value, area.unit)}` };
  });
  return barChart(items, area.daily_target);
}

// "6.5 to 7.4 h a night", "8 to 11 h a week".
function usualSpan(area) {
  const { low, high } = area.usual;
  const span = low === high ? formatNumber(low) : `${formatNumber(low)} to ${formatNumber(high)}`;
  return `${span} ${area.unit} ${area.period === "this week" ? "a week" : "a night"}`;
}

// The last 12 weeks as bars, against a full week's target. Only every fourth
// week is named under its bar, so the names fit on a phone.
function historyBars(area) {
  const last = area.history.length - 1;
  const items = area.history.map((week, i) => {
    const gap = week.value === null || week.value === undefined;
    return { value: week.value, label: i % 4 === 0 || i === last ? week.label : "", today: i === last,
      said: `Week of ${week.label}: ${gap ? "not logged" : withUnit(week.value, area.unit)}` };
  });
  // Your usual range is in the same units as a week's value: nightly for Sleep, a week's total otherwise.
  return barChart(items, area.weekly_target,
    { itemClass: "week-bar history-bar", listClass: "week-bars week-bars-compact", usual: area.usual });
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

// --- Focus sessions and the timer ---

const SESSION_AREAS = { study: "Study", work: "Work" };

// 25 -> "25 min", 60 -> "1 h", 110 -> "1 h 50 min" (the same words as the server's).
export function durationText(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

const sessionsWord = (n) => `${n} session${n === 1 ? "" : "s"}`;
const sessionsFor = (day, areaId) => (day.sessions || []).filter((s) => s.area === areaId);

// Under a log form: today's typed-in hours and sessions added up, e.g.
// "1 h logged + 2 sessions (50 min) = 1 h 50 min". "" when there are no sessions.
export function focusBreakdown(day, areaId) {
  const sessions = sessionsFor(day, areaId);
  if (sessions.length === 0) return "";
  const minutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const logged = day[`${areaId}_hours`];
  if (logged === null || logged === undefined) return `${sessionsWord(sessions.length)} = ${durationText(minutes)}`;
  return `${withUnit(logged, "h")} logged + ${sessionsWord(sessions.length)} (${durationText(minutes)}) = `
    + durationText(Math.round(logged * 60) + minutes);
}

// Today's sessions for one module, newest last, each with a Remove button.
export function renderSessionList(sessions, areaId) {
  const mine = (sessions || []).filter((s) => s.area === areaId);
  if (mine.length === 0) return `<p class="empty">No sessions yet today.</p>`;
  const items = mine.map((s) => {
    const length = durationText(s.minutes);
    return `<li class="session">
      <span class="session-time">${escapeHtml(s.ended_at)}</span>
      <span class="session-length">${escapeHtml(length)}</span>
      <span class="session-task">${escapeHtml(s.task || "No task")}</span>
      <button type="button" class="btn btn-ghost btn-small" data-session-remove="${escapeHtml(s.id)}"
        aria-label="${escapeHtml(`Remove the ${length} session that ended at ${s.ended_at}`)}">Remove</button>
    </li>`;
  }).join("");
  return `<ul class="session-list">${items}</ul>`;
}

// One line about a timer running for a module, linking to its page; "" when none is.
// Used on Home and on the other module's page.
export function timerLine(timer, now) {
  const label = SESSION_AREAS[timer.area];
  if (!label) return "";
  const link = (text) => `<a href="#/${escapeHtml(timer.area)}">${escapeHtml(text)}</a>`;
  if (timer.phase === "away") return `<p class="focus-line">${link(`A ${label} session needs an answer`)}</p>`;
  if (timer.phase !== "focus" && timer.phase !== "break") return "";
  const what = timer.phase === "focus" ? `${label} session ${timer.round} of ${SESSIONS_A_ROUND}` : `${label} break`;
  return `<p class="focus-line">${link(what)} · <span class="focus-time" data-timer-text role="timer">`
    + `${countdownText(remainingMs(timer, now))}</span> left${isPaused(timer) ? " · paused" : ""}</p>`;
}

// The ring that counts down, with the time in the middle.
function focusRing(timer, now) {
  const share = Math.round(ringShare(timer, now) * 1000) / 10;
  return `<div class="focus-ring" data-phase="${escapeHtml(timer.phase)}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="focus-ring-track" cx="60" cy="60" r="54" pathLength="100"/>
      <circle class="focus-ring-fill" data-timer-ring cx="60" cy="60" r="54" pathLength="100" stroke-dasharray="${share} 100"/>
    </svg>
    <p class="focus-clock"><span class="visually-hidden">Time left </span><span data-timer-text role="timer">${countdownText(remainingMs(timer, now))}</span></p>
  </div>`;
}

// The start form: length, task and Start. tasks: today's focus tasks; done: the round just ended.
// goals: study goal names, offered as tasks too, so a session counts toward that goal's pace.
function focusStartForm(areaId, timer, tasks, goals = []) {
  const done = timer.phase === "done" && timer.area === areaId;
  const minutes = done ? timer.minutes : 25;
  const lengths = LENGTHS.map((n) => `<label class="mood-option">
      <input type="radio" name="focus-minutes" value="${n}"${n === minutes ? " checked" : ""}>
      <span>${n}<span class="visually-hidden"> minutes</span></span>
    </label>`).join("");
  const open = tasks.filter((t) => !t.done).map((t) => t.text);
  const option = (text) => {
    const chosen = done && timer.task === text ? " selected" : "";
    return `<option value="${escapeHtml(text)}"${chosen}>${escapeHtml(text)}</option>`;
  };
  const goalNames = goals.filter((name) => !open.includes(name));
  const options = goalNames.length > 0
    ? `${open.length > 0 ? `<optgroup label="Today's focus">${open.map(option).join("")}</optgroup>` : ""}`
      + `<optgroup label="Study goals">${goalNames.map(option).join("")}</optgroup>`
    : open.map(option).join("");
  return `<form id="focus-form" class="focus-form" data-area="${escapeHtml(areaId)}" novalidate>
    ${done ? `<p class="focus-note">Round done: ${SESSIONS_A_ROUND} sessions. Take a proper break.</p>` : ""}
    <fieldset class="mood focus-lengths">
      <legend>Minutes</legend>
      <div class="mood-options">${lengths}</div>
    </fieldset>
    <div class="field">
      <label for="focus-task">Task</label>
      <select id="focus-task" name="task">
        <option value="">No task</option>
        ${options}
      </select>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">${done ? "Start another round" : "Start"}</button>
    </div>
  </form>`;
}

// The timer part of a module's focus panel, for whatever the timer is doing now.
// timer: the state from timer.js; tasks: today's focus tasks; message: a short note to show;
// goals: study goal names for the task picker (Study only).
export function renderFocusPanel(areaId, timer, tasks, now, message = "", goals = []) {
  const note = message ? `<p class="focus-message">${escapeHtml(message)}</p>` : "";
  const busy = ["focus", "break", "away"].includes(timer.phase);
  if (busy && timer.area !== areaId) return `${timerLine(timer, now)}${note}`;

  if (timer.phase === "away") {
    const p = timer.pending;
    return `<p class="focus-note">Your ${escapeHtml(durationText(p.minutes))} session ended at ${escapeHtml(p.ended_at)} while Compass wasn't open. Save it?</p>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" data-focus="keep">Save session</button>
      <button type="button" class="btn btn-ghost" data-focus="drop">Discard session</button>
    </div>${note}`;
  }
  if (!busy) return `${focusStartForm(areaId, timer, tasks, areaId === "study" ? goals : [])}${note}`;

  const paused = isPaused(timer);
  const what = timer.phase === "focus"
    ? `Session ${timer.round} of ${SESSIONS_A_ROUND}${timer.task ? ` · ${timer.task}` : ""}`
    : timer.long ? "Long break · the round ends after it" : `Break · then session ${timer.round + 1} of ${SESSIONS_A_ROUND}`;
  const toggle = paused
    ? `<button type="button" class="btn btn-primary" data-focus="resume">Resume</button>`
    : `<button type="button" class="btn btn-primary" data-focus="pause">Pause</button>`;
  const more = timer.phase === "focus"
    ? `<button type="button" class="btn" data-focus="finish">Finish early</button>
      <button type="button" class="btn btn-ghost" data-focus="reset">Reset</button>`
    : `<button type="button" class="btn" data-focus="skip">${timer.long ? "End round" : "Skip break"}</button>
      <button type="button" class="btn btn-ghost" data-focus="stop">Stop</button>`;
  return `<div class="focus-running" data-phase="${escapeHtml(timer.phase)}">
    ${focusRing(timer, now)}
    <p class="focus-what">${escapeHtml(what)}${paused ? " · paused" : ""}</p>
    <div class="form-actions focus-actions">${toggle}${more}</div>
  </div>${note}`;
}

// Home: today's focus sessions in one line, and the timer if one is running.
// focus: the dashboard's { today: { count, minutes, study, work } }.
export function renderFocusSummary(focus, timer = IDLE, now = 0) {
  const today = focus.today;
  let line = "No focus sessions yet today.";
  if (today.count > 0) {
    const parts = Object.entries(SESSION_AREAS).filter(([id]) => today[id] > 0)
      .map(([id, label]) => `${label} ${durationText(today[id])}`);
    line = `Focus sessions today: ${today.count}, ${durationText(today.minutes)}`
      + (parts.length > 1 ? ` (${parts.join(", ")})` : "") + ".";
  }
  return `<p class="focus-summary-line">${escapeHtml(line)}</p>${timerLine(timer, now)}`;
}

// A module's page: the hero (this week), today's log, the last 7 days, the last 12 weeks,
// contributors and details. Study and Work also get the focus timer and today's sessions.
// area: the module's entry from the dashboard; dates: the 7 days in area.series;
// day: what is logged today; settings: for the sleep schedule and the work type;
// focusTimer: the timer's HTML from renderFocusPanel (a fresh start form when not given).
export function renderModulePage(area, dates, today, day, settings, focusTimer = "") {
  const id = escapeHtml(area.id);
  const hasValue = area.value !== null && area.value !== undefined;
  const hasScore = area.score !== null && area.score !== undefined;
  const target = targetText(area.target, area.mode, area.unit);
  const trend = TREND_WORDS[area.trend]
    ? `<p class="trend" data-trend="${escapeHtml(area.trend)}">${TREND_WORDS[area.trend]}</p>`
    : "";
  const goals = area.details.goals || [];
  const lines = goals.length > 0
    ? renderStudyGoalList(goals)
    : area.details.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const history = area.history && area.history.length > 0
    ? `<section class="panel module-history" aria-labelledby="module-history-title">
    <h2 id="module-history-title">Last 12 weeks</h2>
    ${historyBars(area)}
    ${area.usual ? `<p class="hint usual-key"><span class="usual-swatch" aria-hidden="true"></span>Shaded: your usual range, ${escapeHtml(usualSpan(area))}</p>` : ""}
  </section>`
    : "";

  const top = hero({
    kicker: area.period,
    label: `${area.label} this week`,
    number: hasValue ? formatNumber(area.value) : "-",
    unit: hasValue ? `<span class="unit">${escapeHtml(area.unit)}</span>` : "",
    headline: area.headline,
    score: area.score,
    level: area.score_label,
    reason: area.reason,
    extra: `<p class="hero-meta">
      <span>${escapeHtml(target)}</span>
      ${hasScore ? `<span>Score ${formatNumber(area.score)}</span>` : ""}
      ${area.rest_days ? `<span>${area.rest_days} rest day${area.rest_days === 1 ? "" : "s"}</span>` : ""}
    </p>
    ${trend}
    ${baselineLine(area.learning, area.usual)}
    ${area.guidance ? `<p class="hero-note">${escapeHtml(area.guidance)}</p>` : ""}`,
  });

  const timed = SESSION_AREAS[area.id] !== undefined;
  const focus = timed
    ? `<section class="panel module-focus" aria-labelledby="module-focus-title">
    <h2 id="module-focus-title">Focus timer</h2>
    <div id="focus-timer">${focusTimer || renderFocusPanel(area.id, IDLE, day.tasks || [], 0)}</div>
    <h3 class="focus-list-title">Today's sessions</h3>
    <div id="focus-sessions">${renderSessionList(day.sessions, area.id)}</div>
  </section>`
    : "";
  const breakdown = timed ? focusBreakdown(day, area.id) : "";

  return `${top}
  ${focus}
  <section class="panel module-log" aria-labelledby="module-log-title">
    <h2 id="module-log-title">${area.id === "sleep" ? "Log last night" : "Log today"}</h2>
    <form id="module-log-form" data-area="${id}" novalidate>
      ${moduleLogFields(area.id, day, settings)}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <p class="save-status" id="module-log-status" role="status" aria-live="polite"></p>
      </div>
    </form>
    ${timed ? `<p class="hint focus-breakdown" id="focus-breakdown"${breakdown ? "" : " hidden"}>${escapeHtml(breakdown)}</p>` : ""}
  </section>
  <section class="panel module-days" aria-labelledby="module-days-title">
    <h2 id="module-days-title">Last 7 days</h2>
    ${weekBars(area, dates, today)}
  </section>
  ${history}
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

// The Study page's goals: name and countdown, the sessions put in, the pace line, and the
// steps as checkboxes. goals: details.goals from the dashboard.
export function renderStudyGoalList(goals) {
  const items = goals.map((g) => {
    const meta = [g.when, g.steps_text].filter(Boolean).map(escapeHtml).join(" · ");
    const steps = g.steps.length > 0
      ? `<ul class="task-list study-step-list" aria-label="Steps for ${escapeHtml(g.name)}">${g.steps.map((step, j) => `<li class="task${step.done ? " is-done" : ""}">
        <label>
          <input type="checkbox" id="study-step-${g.index}-${j}" data-goal="${g.index}" data-step="${j}"${step.done ? " checked" : ""}>
          <span class="task-text">${escapeHtml(step.text)}</span>
        </label>
      </li>`).join("")}</ul>`
      : "";
    return `<li class="study-goal">
      <h3 class="study-goal-name">${escapeHtml(g.name)}</h3>
      ${meta ? `<p class="study-goal-meta">${meta}</p>` : ""}
      <p class="study-goal-sessions">${escapeHtml(g.sessions)}</p>
      ${g.pace ? `<p class="hint">${escapeHtml(g.pace)}</p>` : ""}
      ${steps}
    </li>`;
  }).join("");
  return `<ul class="study-goal-list">${items}</ul>`;
}

// The form that replaces a module's details when Edit is pressed.
// hours: the saved Study or Work hours a week (not used for Sleep).
// title: the panel's heading, drawn again above the form so the panel keeps its name.
// today: for the Study goals' date hints.
export function renderModuleEdit(areaId, settings, hours, title = "", today = null) {
  let fields;
  if (areaId === "sleep") {
    fields = renderSleepChoice(settings, "mod", false);
  } else if (areaId === "study") {
    fields = `<div id="module-study">${renderStudyGoals(settings.study_goals, hours, "mod", today, true)}</div>`;
  } else {
    fields = WORK_QUESTIONS.map((_, i) => renderWorkQuestion(i, settings.work, hours, "mod")).join("");
  }
  const heading = title ? `<h2 id="module-details-title">${escapeHtml(title)}</h2>` : "";
  return `${heading}<form id="module-edit-form" data-area="${escapeHtml(areaId)}" novalidate>
    ${fields}
    <p class="form-error" id="module-edit-error" role="alert" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Save</button>
      <button type="button" class="btn btn-ghost" id="module-edit-cancel">Cancel</button>
    </div>
  </form>`;
}

// --- Check-in, carry-over and Insights ---

// Home's check-in for today: mood from 1 to 5, tags, and whether it is a rest day.
// day: { mood, tags, rest }; tags: [{ id, label }] from the dashboard.
export function renderCheckIn(day, tags) {
  const moods = [1, 2, 3, 4, 5].map((n) => `<label class="mood-option">
      <input type="radio" name="mood" value="${n}"${day.mood === n ? " checked" : ""}>
      <span>${n}<span class="visually-hidden"> out of 5</span></span>
    </label>`).join("");
  const clear = day.mood === null || day.mood === undefined
    ? ""
    : `<button type="button" class="btn btn-small btn-ghost" data-clear-mood>Clear</button>`;
  const picked = day.tags || [];
  const toggles = tags.map((tag) => `<button type="button" class="tag-toggle" data-tag="${escapeHtml(tag.id)}" aria-pressed="${picked.includes(tag.id)}">${escapeHtml(tag.label)}</button>`).join("");

  return `<fieldset class="mood">
      <legend>Mood</legend>
      <div class="mood-options">${moods}${clear}</div>
      <p class="hint">1 is low, 5 is great.</p>
    </fieldset>
    <div class="tag-block">
      <p class="field-label" id="tags-label">Anything different today?</p>
      <div class="tag-toggles" role="group" aria-labelledby="tags-label">${toggles}</div>
    </div>
    <label class="check-option" for="rest-day">
      <input type="checkbox" id="rest-day"${day.rest ? " checked" : ""}> Rest day (weekly targets ask for less)
    </label>`;
}

// Yesterday's unfinished focus tasks, each as a button that adds it to today.
export function renderCarryOver(texts) {
  if (texts.length === 0) return "";
  const buttons = texts.map((text, i) => `<button type="button" class="btn btn-small" data-carry="${i}">+ ${escapeHtml(text)}</button>`).join("");
  return `<p class="hint">From yesterday:</p><div class="button-row">${buttons}</div>`;
}

// The Insights page: the weekly review, patterns and streaks. data: GET /api/insights.
export function renderInsights(data) {
  const { review, patterns, streaks } = data;
  const has = review.score.value !== null && review.score.value !== undefined;
  const top = hero({
    kicker: "Weekly review",
    number: has ? formatNumber(review.score.value) : "-",
    headline: review.score.headline,
    score: review.score.value,
    level: review.score.label,
    extra: `<p class="hero-meta">
      <span>${escapeHtml(review.range)}</span>
      ${review.score.text ? `<span>${escapeHtml(review.score.text)}</span>` : ""}
    </p>`,
  });

  const rows = review.modules.map((m) => {
    const scored = m.score !== null && m.score !== undefined;
    const said = [m.value_text + (m.value_text.endsWith(".") || !m.change_text ? "" : "."), m.change_text, m.best]
      .filter(Boolean).join(" ");
    return `<li class="review-row" data-level="${levelKey(m.score_label)}">
        <a class="review-name" href="#/${escapeHtml(m.id)}">${escapeHtml(m.label)}</a>
        <span class="review-score">${scored ? `Score ${formatNumber(m.score)}` : "No score"}</span>
        <span class="review-text">${escapeHtml(said)}</span>
      </li>`;
  }).join("");
  const extras = review.extras.map((line) => `<p class="review-extra">${escapeHtml(line)}</p>`).join("");
  const change = review.change ? `<p class="review-change">${escapeHtml(review.change)}</p>` : "";

  const patternItems = patterns.length > 0
    ? `<ul class="pattern-list">${patterns.map((p) => `<li>
        <p>${escapeHtml(p.text)}</p>
        <p class="hint">${escapeHtml(p.detail)}</p>
      </li>`).join("")}</ul>`
    : `<p class="empty">No patterns yet. Compass needs at least 3 days on each side of a comparison, from the last 4 weeks.</p>`;

  const streakItems = streaks.map((s) => `<li class="streak" data-state="${escapeHtml(s.state || "out")}">
      <span class="streak-flame" aria-hidden="true"></span>
      <span class="streak-label">${escapeHtml(s.label)}</span>
      <span class="streak-days">${escapeHtml(s.text)}</span>
      <span class="streak-best">Best: ${formatNumber(s.best)}</span>
    </li>`).join("");

  return `${top}
  <section class="panel" aria-labelledby="review-title">
    <h2 id="review-title">This week</h2>
    <ul class="review-list">${rows}</ul>
    ${extras}
    ${change}
  </section>
  <section class="panel" aria-labelledby="patterns-title">
    <h2 id="patterns-title">Patterns</h2>
    ${patternItems}
  </section>
  ${renderFocusReport(data.focus_report)}
  <section class="panel" aria-labelledby="streaks-title">
    <h2 id="streaks-title">Streaks</h2>
    <p class="hint">One missed day only fades a streak; do it the next day to revive it. Rest days don't count against you.</p>
    <ul class="streak-list">${streakItems}</ul>
    ${renderShield(data.shield, data.date)}
  </section>`;
}

// The weekly Focus Report: locked for the first 7 days, then a few plain lines.
// report: { locked, text } or { locked: false, lines }, or null without Study or Work.
export function renderFocusReport(report) {
  if (!report) return "";
  const body = report.locked
    ? `<p class="empty focus-report-locked">${escapeHtml(report.text)}</p>`
    : `<ul class="focus-report">${report.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  return `<section class="panel" aria-labelledby="focus-report-title">
    <h2 id="focus-report-title">Focus Report</h2>
    ${body}
  </section>`;
}

// Pausing streaks for a holiday or an exam period. shield: the active pause or null.
export function renderShield(shield, today) {
  if (shield) {
    return `<div class="shield" data-active>
      <p>${escapeHtml(shield.text)}</p>
      <button type="button" class="btn btn-small" data-shield-end>End the pause now</button>
    </div>`;
  }
  return `<form class="shield" id="shield-form" novalidate>
    <h3>Pause streaks</h3>
    <p class="hint">For a holiday or an exam period. Paused days neither count nor break a streak.</p>
    <div class="field">
      <label for="shield-reason">Reason</label>
      <select id="shield-reason" name="reason">
        <option value="holiday">Holiday</option>
        <option value="exam">Exam period</option>
      </select>
    </div>
    <div class="field">
      <label for="shield-end">Until</label>
      <input id="shield-end" name="end" type="date" min="${escapeHtml(today)}" required>
    </div>
    <p class="form-error" id="shield-error" role="alert" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn">Pause streaks</button>
    </div>
  </form>`;
}

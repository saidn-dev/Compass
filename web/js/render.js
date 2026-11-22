// Turns data into HTML text. No network, no clicks. All user text goes through escapeHtml.
// Each function returns a string; app.js puts it into the page.
// web/preview.html shows the HTML each one produces, and styles.css styles it.

import { dateHint, parseDate } from "./dates.js";
import { PERIODS, canStep, focusPeriod, focusStreaks, pomoCounts } from "./stats.js";
import { ADJUST_STEP, IDLE, LENGTHS, MAX_MINUTES, isPaused, isStrict, readoutText, ringShare, roundSize } from "./timer.js";

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
  focus: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>`,
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

// The half-circle gauge behind a hero number, drawn in the page's own hue (light at the
// reading's end). Each gauge gets its own gradient id, since several heroes share the document.
let gaugeCount = 0;
function gauge(score) {
  const arc = "M 16 104 A 84 84 0 0 1 184 104";
  const id = `gauge-wash-${(gaugeCount += 1)}`;
  return `<svg class="gauge" aria-hidden="true" viewBox="0 12 200 100">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop class="gauge-stop-from" offset="0"/><stop class="gauge-stop-to" offset="1"/>
      </linearGradient></defs>
      <path class="gauge-track" d="${arc}" pathLength="100"/>
      <path class="gauge-fill" d="${arc}" pathLength="100" stroke="url(#${id})" stroke-dasharray="${filled(score)} 100"/>
    </svg>`;
}

// The level word and, next to it, the top reason: "Fair · Mostly hours: 4 of 10 h this week".
// The reason is the "why" behind the number, shown without a tap.
// after: more of the same line (already escaped), such as the trend on a module page.
function heroStatus(level, reason, after = "") {
  const known = level && level !== "No data";
  if (!known && !after) return "";
  const why = reason ? `<span class="hero-reason">${escapeHtml(reason)}</span>` : "";
  return `<p class="hero-status">${known ? `<span class="status">${escapeHtml(level)}</span>` : ""}${why}${after}</p>`;
}

// The big block at the top of a page: gauge, small label, big number, headline,
// then the level word with its reason.
// extra: more HTML under that (already escaped).
// label: what a screen reader calls the block; the kicker when not given.
// statusAfter: more HTML on the status line (already escaped).
function hero({ kicker, label = kicker, number, unit = "", headline, score, level, reason = null, extra = "", statusAfter = "" }) {
  return `<section class="hero" data-level="${levelKey(level)}" aria-label="${escapeHtml(label)}">
    <div class="gauge-wrap">
      ${gauge(score)}
      <div class="gauge-readout">
        <p class="hero-kicker">${escapeHtml(kicker)}</p>
        <p class="hero-value"><span class="hero-number">${number}</span>${unit}</p>
      </div>
    </div>
    <h2 class="hero-headline">${escapeHtml(headline)}</h2>
    ${heroStatus(level, reason, statusAfter)}
    ${extra}
  </section>`;
}

// Under a module's hero: one capsule per contributor, its outline lit to the score, in the
// page's hue. The contributor rows below say the same in words, so these stay short.
// Small line glyphs for the pills, drawn on a 16-unit grid.
const PILL_GLYPHS = {
  moon: '<path d="M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5a5.5 5.5 0 1 0 6.7 6.7Z"/>',
  hourglass: '<path d="M4.5 2.5h7M4.5 13.5h7M5.5 2.5c0 3 5 3.5 5 5.5s-5 2.5-5 5.5M10.5 2.5c0 3-5 3.5-5 5.5s5 2.5 5 5.5"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  check: '<path d="M3.5 8.5l3 3 6-6.5"/>',
};

function pillGlyph(label, areaId) {
  const key = { Bedtime: "clock", Logging: "check" }[label] || (areaId === "sleep" ? "moon" : "hourglass");
  return `<svg class="ring-pill-glyph" viewBox="0 0 16 16">${PILL_GLYPHS[key]}</svg>`;
}

function ringPills(contributors, areaId) {
  if (contributors.length === 0) return "";
  const pills = contributors.map((c) => {
    const has = c.score !== null && c.score !== undefined;
    return `<li class="ring-pill">
        <span class="ring-pill-dial" aria-hidden="true">
          <svg viewBox="0 0 76 40"><rect class="ring-pill-track" x="1.5" y="1.5" width="73" height="37" rx="18.5" pathLength="100"/>
            <rect class="ring-pill-fill" x="1.5" y="1.5" width="73" height="37" rx="18.5" pathLength="100" stroke-dasharray="${filled(c.score)} 100"/></svg>
          ${pillGlyph(c.label, areaId)}<span class="ring-pill-number">${has ? formatNumber(c.score) : "\u2013"}</span>
        </span>
        <span class="ring-pill-label">${escapeHtml(c.label)}<span class="visually-hidden">: ${has ? `score ${formatNumber(c.score)}` : "not logged"}</span></span>
      </li>`;
  }).join("");
  return `<ul class="ring-pills" aria-label="Contributor scores">${pills}</ul>`;
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

// focusable: Study or Work is on, so each open task gets a Focus button that opens the
// Focus page with that task picked (TickTick's "Start Focus" on a task).
export function renderTasks(tasks, focusable = false) {
  if (tasks.length === 0) return `<p class="empty">Nothing planned yet.</p>`;

  const items = tasks.map((t, i) => `<li class="task${t.done ? " is-done" : ""}">
    <label>
      <input type="checkbox" data-index="${i}"${t.done ? " checked" : ""}>
      <span class="task-text">${escapeHtml(t.text)}</span>
    </label>
    ${focusable && !t.done ? `<button type="button" class="btn btn-ghost btn-small task-focus" data-focus-task="${i}"
      aria-label="Focus on ${escapeHtml(t.text)}">Focus</button>` : ""}
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

// A time box: plain text in 24-hour "HH:MM", so it never shows AM/PM. app.js tidies what is
// typed ("2300" -> "23:00") and the server checks it.
export const TIME_BOX = 'type="text" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="--:--" '
  + 'pattern="([01][0-9]|2[0-3]):[0-5][0-9]" data-time';

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
      <input id="${idStart}-bed" name="${name}-bed" ${TIME_BOX} value="${escapeHtml(bed)}">
    </div>
    <div class="field">
      <label for="${idStart}-wake">${wakeLabel}</label>
      <input id="${idStart}-wake" name="${name}-wake" ${TIME_BOX} value="${escapeHtml(wake)}">
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
        <input id="${id}-work-start" name="work-start" ${TIME_BOX} value="${escapeHtml(start)}">
      </div>
      <div class="field">
        <label for="${id}-work-end">To</label>
        <input id="${id}-work-end" name="work-end" ${TIME_BOX} value="${escapeHtml(end)}">
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
    `<a class="nav-link${extra}" href="${href}"${page === current || (page === "focus" && current === "focus-stats") ? ' aria-current="page"' : ""}>${icon(page, "nav-icon")}<span>${escapeHtml(text)}</span></a>`;
  const shown = areas.filter((a) => modules.includes(a.id));
  const label = shown.length > 0 ? `<p class="nav-label">Modules</p>` : "";
  const moduleLinks = shown.map((a) => link(a.id, `#/${escapeHtml(a.id)}`, a.label)).join("");
  const focus = modules.some((id) => id === "study" || id === "work")
    ? link("focus", "#/focus", "Focus", " nav-focus") : "";
  return `${link("home", "#/", "Home")}${label}${moduleLinks}${focus}${link("insights", "#/insights", "Insights", " nav-insights")}${link("settings", "#/settings", "Settings", " nav-settings")}`;
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
      <input id="mod-log-${name}" name="${name}" ${TIME_BOX} value="${escapeHtml(value)}">
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
  // A second value (value2) stacks a second series in the same bar. Both are real zeros
  // when supplied: an empty focus day is 0, not a gap.
  const valuesOf = (item) => [item.value, item.value2].filter((v) => v !== null && v !== undefined);
  // The scale's top is the tallest whole bar: a stacked bar counts both its parts.
  const logged = items.map((item) => valuesOf(item).reduce((total, v) => total + (Number(v) || 0), 0));
  const top = Math.max(Number(target) || 0, ...logged, usual ? usual.high : 0, 0) || 1;
  const percent = (n) => `${Math.round((n / top) * 1000) / 10}%`;
  const part = (n, total) => total > 0 ? `${Math.round((n / total) * 1000) / 10}%` : "0%";
  const stacked = items.some((item) => item.value2 !== null && item.value2 !== undefined);

  const bars = items.map((item) => {
    const gap = valuesOf(item).length === 0;
    const first = Number(item.value) || 0;
    const second = Number(item.value2) || 0;
    const total = first + second;
    const fill = stacked && !gap
      ? `<span class="week-bar-stack" style="--height: ${percent(total)}">
          <span class="week-bar-fill week-bar-fill-b" style="--height: ${part(second, total)}"></span>
          <span class="week-bar-fill week-bar-fill-a" style="--height: ${part(first, total)}"></span>
        </span>`
      : `<span class="week-bar-fill" style="--height: ${gap ? "0%" : percent(item.value)}"></span>`;
    return `<li class="${itemClass}"${gap ? " data-gap" : ""}${item.today ? " data-today" : ""}>
        <span class="week-bar-value" aria-hidden="true">${gap ? "\u2013" : formatNumber(total)}</span>
        <span class="week-bar-track" aria-hidden="true">${fill}</span>
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
export function timerLine(timer, now, toFocus = false) {
  const label = SESSION_AREAS[timer.area];
  if (!label) return "";
  const href = toFocus ? "#/focus" : `#/${escapeHtml(timer.area)}`;
  const link = (text) => `<a href="${href}">${escapeHtml(text)}</a>`;
  if (timer.phase === "away") return `<p class="focus-line">${link(`A ${label} session needs an answer`)}</p>`;
  if (timer.phase === "watch") {
    return `<p class="focus-line">${link(`${label} stopwatch`)} · <span class="focus-time" data-timer-text role="timer">`
      + `${readoutText(timer, now)}</span> counted${isPaused(timer) ? " · paused" : ""}</p>`;
  }
  if (timer.phase !== "focus" && timer.phase !== "break") return "";
  const what = timer.phase === "focus" ? `${label} session ${timer.round} of ${roundSize(timer)}` : `${label} break`;
  const state = timer.waiting ? " · ready to start" : isPaused(timer) ? " · paused" : "";
  return `<p class="focus-line">${link(what)} · <span class="focus-time" data-timer-text role="timer">`
    + `${readoutText(timer, now)}</span> left${state}</p>`;
}

// The running timer's buttons. Resume becomes "Start break" / "Start session" when the
// phase is waiting for a press (auto-start off). Strict mode leaves a running session no
// way to pause, cut it short or throw it away.
export function timerButtons(timer) {
  const watch = timer.phase === "watch";
  let toggle = isPaused(timer)
    ? `<button type="button" class="btn btn-primary" data-focus="resume">${timer.waiting
      ? (timer.phase === "break" ? "Start break" : "Start session") : "Resume"}</button>`
    : `<button type="button" class="btn btn-primary" data-focus="pause">Pause</button>`;
  let more = `<button type="button" class="btn" data-focus="skip">${timer.long ? "End round" : "Skip break"}</button>
      <button type="button" class="btn btn-ghost" data-focus="stop">Stop</button>`;
  if (watch) {
    more = `<button type="button" class="btn" data-focus="finish">Stop and save</button>
      <button type="button" class="btn btn-ghost" data-focus="reset">Reset</button>`;
  } else if (timer.phase === "focus" && isStrict(timer) && !timer.waiting) {
    more = `<p class="focus-strict-note">Strict mode: this session runs to the end.</p>`;
    if (!isPaused(timer)) toggle = "";
  } else if (timer.phase === "focus") {
    more = `<button type="button" class="btn" data-focus="finish">Finish early</button>
      <button type="button" class="btn btn-ghost" data-focus="reset">Reset</button>`;
  }
  return { toggle, more };
}

// The time as an LCD readout in a bezel: a seven-segment face, unlit "8"s behind the lit
// digits, and under a countdown a timeline of the time left. The stopwatch has no limit to
// show, so it gets no timeline.
function focusRing(timer, now) {
  const share = Math.round(ringShare(timer, now) * 1000) / 10;
  const text = readoutText(timer, now);
  const what = timer.phase === "watch" ? "Time counted " : "Time left ";
  return `<div class="focus-ring focus-lcd" data-phase="${escapeHtml(timer.phase)}">
    <p class="focus-clock">
      <span class="lcd-ghost" aria-hidden="true" data-timer-ghost>${text.replace(/\d/g, "8")}</span>
      <span class="visually-hidden">${what}</span><span class="lcd-digits" data-timer-text role="timer">${text}</span>
    </p>
    ${timer.phase === "watch" ? "" : `<svg class="lcd-timeline" viewBox="0 0 200 4" preserveAspectRatio="none" aria-hidden="true">
      <line class="focus-ring-track" x1="2" y1="2" x2="198" y2="2" pathLength="100"/>
      <line class="focus-ring-fill" data-timer-ring x1="2" y1="2" x2="198" y2="2" pathLength="100" stroke-dasharray="${share} 100"/>
    </svg>`}
  </div>`;
}

// The task picker. tasks: today's focus tasks; goals: study goal names, offered as tasks too,
// so a session counts toward that goal's pace; chosen: the task to select.
export function renderFocusTaskPicker(id, tasks, goals, chosen) {
  const open = tasks.filter((t) => !t.done).map((t) => t.text);
  const option = (text) => `<option value="${escapeHtml(text)}"${chosen === text ? " selected" : ""}>${escapeHtml(text)}</option>`;
  const goalNames = goals.filter((name) => !open.includes(name));
  const options = goalNames.length > 0
    ? `${open.length > 0 ? `<optgroup label="Today's focus">${open.map(option).join("")}</optgroup>` : ""}`
      + `<optgroup label="Study goals">${goalNames.map(option).join("")}</optgroup>`
    : open.map(option).join("");
  return `<div class="field">
      <label for="${id}">Task</label>
      <select id="${id}" name="task">
        <option value="">No task</option>
        ${options}
      </select>
    </div>`;
}

// The task names of recent sessions in one area, newest first and each once: the task
// popover's Recent tab. log: the Focus page's days, newest first.
export function recentTasks(log, area, limit = 8) {
  const names = [];
  for (const dayEntry of log || []) {
    for (const s of [...(dayEntry.sessions || [])].reverse()) {
      if (s.area === area && s.task && !names.includes(s.task)) names.push(s.task);
      if (names.length >= limit) return names;
    }
  }
  return names;
}

// The Focus page's task picker, after TickTick's: "No task ›" opens a popover with Recent,
// Task and Habit tabs, a search box and grouped rows. The choice is kept in a hidden input
// with the form's task id, so the start form reads it as before.
// sources: { recent: [names], habits: [names] }.
export function renderTaskPopover(id, tasks, goals, chosen, sources = {}) {
  const { recent = [], habits = [], estimates = {}, pomos = {} } = sources;
  const tally = (text) => {
    const done = pomos[text] || 0;
    const planned = estimates[text] || 0;
    if (!done && !planned) return "";
    return `<span class="task-pop-pomos" aria-label="${planned ? `${done} of ${planned} pomos` : `${done} ${done === 1 ? "pomo" : "pomos"}`}">${planned ? `${done}/${planned}` : done}</span>`;
  };
  const open = tasks.filter((t) => !t.done).map((t) => t.text);
  const goalNames = goals.filter((name) => !open.includes(name));
  const pid = escapeHtml(id);
  const row = (text) => `<li><button type="button" class="task-pop-row" data-task-pick="${escapeHtml(text)}" aria-pressed="${chosen === text}">
        <span class="task-pop-dot" aria-hidden="true"></span><span class="task-pop-name">${escapeHtml(text)}</span>${tally(text)}
      </button></li>`;
  const group = (title, names) => names.length === 0 ? ""
    : `<div class="task-pop-group">${title ? `<p class="task-pop-heading">${title}</p>` : ""}<ul class="task-pop-list">${names.map(row).join("")}</ul></div>`;
  const empty = (text) => `<p class="task-pop-empty">${text}</p>`;
  const panes = [
    ["recent", "Recent", group("", recent) || empty("No recent tasks yet.")],
    ["task", "Task", (group("Today", open) + group("Study goals", goalNames)) || empty("No tasks for today. Add them on Home.")],
    ["habit", "Habit", group("", habits) || empty("No habits yet.")],
  ];
  const tabs = panes.map(([key, label]) => `<button type="button" class="segment" role="tab" id="${pid}-pop-tab-${key}"
        aria-controls="${pid}-pop-panel-${key}" aria-selected="${key === "task"}" tabindex="${key === "task" ? 0 : -1}" data-tab="${key}">${label}</button>`).join("");
  const panels = panes.map(([key, , body]) => `<div class="task-pop-panel" id="${pid}-pop-panel-${key}" role="tabpanel" aria-labelledby="${pid}-pop-tab-${key}"${key === "task" ? "" : " hidden"}>${body}</div>`).join("");
  return `<div class="task-pop-wrap" data-task-pop>
      <input type="hidden" id="${pid}" name="task" value="${escapeHtml(chosen || "")}">
      <button type="button" class="task-pop-trigger" data-pop-open aria-expanded="false" aria-controls="${pid}-pop">
        <span class="visually-hidden">Task: </span><span data-task-pop-label>${escapeHtml(chosen || "No task")}</span>
      </button>
      <div class="pop task-pop" id="${pid}-pop" role="dialog" aria-label="Choose a task" hidden>
        <div class="segmented task-pop-tabs" role="tablist" aria-label="Task lists" data-tabs="${pid}-pop">${tabs}</div>
        <label class="task-pop-search">
          <span class="visually-hidden">Search tasks</span>
          <input type="search" placeholder="Search or add a task" autocomplete="off" maxlength="200" data-task-search>
        </label>
        <button type="button" class="task-pop-row task-pop-create" data-task-create hidden>
          <span class="task-pop-plus" aria-hidden="true">+</span><span class="task-pop-name">Add “<span data-task-create-name></span>”</span>
        </button>
        <p class="task-pop-note" data-task-pop-note role="status"></p>
        <button type="button" class="task-pop-row task-pop-none" data-task-pick="" aria-pressed="${!chosen}">
          <span class="task-pop-dot" aria-hidden="true"></span><span class="task-pop-name">No task</span>
        </button>
        ${panels}
      </div>
    </div>`;
}

// The Study/Work switch on the Focus page. Each form has its own radio name so the
// hidden Stopwatch form can't change the visible Timer form.
export function renderFocusAreaPicker(options, selected, name) {
  const choices = options.map((area) => `<label class="mood-option">
      <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(area.id)}"${area.id === selected ? " checked" : ""}>
      <span>${escapeHtml(area.label)}</span>
    </label>`).join("");
  return `<fieldset class="mood focus-area-picker">
    <legend>Focus area</legend>
    <div class="mood-options">${choices}</div>
  </fieldset>`;
}

const FOCUS_MODES = [["timer", "Timer"], ["stopwatch", "Stopwatch"]];

// The start forms, in two tabs: Timer (a set length, counted down in rounds of sessions and
// breaks) and Stopwatch (counts up until stopped). mode: the tab to show first.
// areaOptions, when given, adds a Study/Work switch to both forms; the checked radio is
// read at submit time so changing it doesn't need a full panel redraw.
function focusStartForm(areaId, timer, tasks, goals = [], mode = "timer", areaOptions = null) {
  const done = timer.phase === "done" && timer.area === areaId;
  const minutes = done ? timer.minutes : 25;
  const own = LENGTHS.includes(minutes) ? "" : String(minutes);
  const lengths = LENGTHS.map((n) => `<label class="mood-option">
      <input type="radio" name="focus-minutes" value="${n}"${n === minutes ? " checked" : ""}>
      <span>${n}<span class="visually-hidden"> minutes</span></span>
    </label>`).join("");
  const chosen = done ? timer.task : null;
  const area = escapeHtml(areaId);
  const picker = areaOptions ? renderFocusAreaPicker(areaOptions, areaId, "focus-area") : "";
  const watchPicker = areaOptions ? renderFocusAreaPicker(areaOptions, areaId, "watch-area") : "";
  const formGoals = areaId === "study" ? goals : [];
  const tabs = FOCUS_MODES.map(([key, label]) => `<button type="button" class="segment" role="tab" id="focus-tab-${key}"
      aria-controls="focus-pane-${key}" aria-selected="${key === mode}" tabindex="${key === mode ? 0 : -1}" data-tab="${key}">${label}</button>`).join("");
  return `<div class="segmented focus-modes" role="tablist" aria-label="Focus mode" data-tabs="focus-${area}">${tabs}</div>
  <div class="focus-pane" id="focus-pane-timer" role="tabpanel" aria-labelledby="focus-tab-timer"${mode === "timer" ? "" : " hidden"}>
  <form id="focus-form" class="focus-form" data-area="${area}" novalidate>
    ${picker}
    ${done ? `<p class="focus-note">Round done: ${roundSize(timer)} sessions. Take a proper break.</p>` : ""}
    <div class="focus-lengths-row">
      <fieldset class="mood focus-lengths">
        <legend>Minutes</legend>
        <div class="mood-options">${lengths}</div>
      </fieldset>
      <div class="field focus-own">
        <label for="focus-own">Your own</label>
        <div class="input-unit">
          <input id="focus-own" name="focus-own" type="number" min="1" max="${MAX_MINUTES}" step="1" inputmode="numeric" value="${own}" aria-describedby="focus-own-hint">
          <span class="unit">min</span>
        </div>
      </div>
    </div>
    <p class="hint" id="focus-own-hint">1 to ${MAX_MINUTES} minutes. Rounds of sessions with breaks between.</p>
    <div class="focus-task-picker">${renderFocusTaskPicker("focus-task", tasks, formGoals, chosen)}</div>
    <div class="form-actions">
      <button type="submit" class="btn btn-main">${done ? "Start another round" : "Start"}</button>
    </div>
  </form>
  </div>
  <div class="focus-pane" id="focus-pane-stopwatch" role="tabpanel" aria-labelledby="focus-tab-stopwatch"${mode === "stopwatch" ? "" : " hidden"}>
  <form id="watch-form" class="focus-form" data-area="${area}" novalidate>
    ${watchPicker}
    <p class="hint">Counts up until you stop it, for up to ${MAX_MINUTES / 60} hours. Stop saves the whole minutes.</p>
    <div class="focus-task-picker">${renderFocusTaskPicker("watch-task", tasks, formGoals, chosen)}</div>
    <div class="form-actions">
      <button type="submit" class="btn btn-main">Start stopwatch</button>
    </div>
  </form>
  </div>`;
}

// The timer part of a module's focus panel, for whatever the timer is doing now.
// timer: the state from timer.js; tasks: today's focus tasks; message: a short note to show;
// goals: study goal names for the task picker (Study only); mode: "timer" or "stopwatch",
// the tab the start forms open on.
export function renderFocusPanel(areaId, timer, tasks, now, message = "", goals = [], mode = "timer", areaOptions = null) {
  const note = message ? `<p class="focus-message">${escapeHtml(message)}</p>` : "";
  const busy = ["focus", "break", "away", "watch"].includes(timer.phase);
  // On the Focus page the running timer chooses the area; while idle the radio does.
  const effectiveArea = areaOptions && busy && SESSION_AREAS[timer.area] ? timer.area : areaId;
  if (busy && timer.area !== effectiveArea) return `${timerLine(timer, now)}${note}`;

  if (timer.phase === "away") {
    const p = timer.pending;
    return `<p class="focus-note">Your ${escapeHtml(durationText(p.minutes))} session ended at ${escapeHtml(p.ended_at)} while Compass wasn't open. Save it?</p>
    <div class="form-actions">
      <button type="button" class="btn btn-primary" data-focus="keep">Save session</button>
      <button type="button" class="btn btn-ghost" data-focus="drop">Discard session</button>
    </div>${note}`;
  }
  if (!busy) return `${focusStartForm(areaId, timer, tasks, goals, mode, areaOptions)}${note}`;

  const paused = isPaused(timer);
  const watch = timer.phase === "watch";
  const task = timer.task ? ` · ${timer.task}` : "";
  const prefix = areaOptions ? `${SESSION_AREAS[effectiveArea] || ""} ` : "";
  const sentence = (text) => areaOptions ? `${prefix}${text}` : text.charAt(0).toUpperCase() + text.slice(1);
  let what = sentence(`stopwatch${task}`);
  if (!watch) {
    const phrase = timer.phase === "focus"
      ? `session ${timer.round} of ${roundSize(timer)}${task}`
      : timer.long ? "long break · the round ends after it" : `break · then session ${timer.round + 1} of ${roundSize(timer)}`;
    what = sentence(phrase);
  }
  const { toggle, more } = timerButtons(timer);
  return `<div class="focus-running" data-phase="${escapeHtml(timer.phase)}"${paused ? " data-paused" : ""}>
    ${focusRing(timer, now)}
    <p class="focus-what">${escapeHtml(what)}${timer.waiting ? " · ready to start" : paused ? " · paused" : ""}</p>
    <div class="form-actions focus-actions">${toggle}${more}</div>
  </div>${note}`;
}

// The Focus page's timer, laid out like TickTick's Focus screen: the mode switch on top,
// "Focus ›" (the task), a large ring with the time, and one Start pill. Clicking the time
// opens the minute wheel from the Pixlpin timer in the ring's place. Running, the ring
// counts down and the controls sit under it. Monochrome: no colour on the Focus page.
// Same arguments as renderFocusPanel, so the Focus page and its live redraw share wiring.
export function renderFocusCard(areaId, timer, tasks, now, message = "", goals = [], mode = "timer", areaOptions = null, sources = {}) {
  const note = message ? `<p class="focus-message">${escapeHtml(message)}</p>` : "";
  const busy = ["focus", "break", "away", "watch"].includes(timer.phase);
  const effectiveArea = areaOptions && busy && SESSION_AREAS[timer.area] ? timer.area : areaId;
  if (busy && timer.area !== effectiveArea) return `${timerLine(timer, now)}${note}`;

  if (timer.phase === "away") {
    const p = timer.pending;
    return `<div class="focus-card" data-state="away" data-phase="away">
      ${focusDial(0, `<p class="focus-card-time">${escapeHtml(durationText(p.minutes))}</p>`)}
      <p class="focus-card-head">This session ended at ${escapeHtml(p.ended_at)} while Compass wasn't open. Save it?</p>
      <div class="form-actions focus-card-actions">
        <button type="button" class="btn btn-primary" data-focus="keep">Save session</button>
        <button type="button" class="btn btn-ghost" data-focus="drop">Discard session</button>
      </div>
    </div>${note}`;
  }
  if (!busy) return `${focusCardStart(areaId, timer, tasks, goals, mode, areaOptions, sources)}${note}`;

  const paused = isPaused(timer);
  const watch = timer.phase === "watch";
  const share = watch ? 0 : Math.round(ringShare(timer, now) * 1000) / 10;
  const text = readoutText(timer, now);
  const what = watch ? "Time counted " : "Time left ";
  const task = timer.task ? ` · ${escapeHtml(timer.task)}` : "";
  const prefix = areaOptions ? `${SESSION_AREAS[effectiveArea] || ""} ` : "";
  const sentence = (value) => areaOptions ? `${prefix}${value}` : value.charAt(0).toUpperCase() + value.slice(1);
  let label = sentence(`stopwatch${task}`);
  if (!watch) {
    label = sentence(timer.phase === "focus"
      ? `session ${timer.round} of ${roundSize(timer)}${task}`
      : timer.long ? "long break · the round ends after it" : `break · then session ${timer.round + 1} of ${roundSize(timer)}`);
  }
  const { toggle, more } = timerButtons(timer);
  // The screen reader reads the plain text; the eye sees the same time as rolling digits.
  const time = `<p class="focus-card-time">
      <span class="visually-hidden">${what}</span><span class="visually-hidden" data-timer-text role="timer">${text}</span><span class="focus-digits" data-timer-digits aria-hidden="true">${timeDigits(text)}</span>
    </p>`;
  return `<div class="focus-card" data-state="running" data-phase="${escapeHtml(timer.phase)}"${paused ? " data-paused" : ""}>
    <p class="focus-card-head">${label}${timer.waiting ? " · ready to start" : paused ? " · paused" : ""}</p>
    ${focusDial(share, timer.phase === "focus" ? `<button type="button" class="focus-adjust is-less" data-focus="less"
        aria-label="${ADJUST_STEP} minutes less">−</button>${time}<button type="button" class="focus-adjust is-more" data-focus="more"
        aria-label="${ADJUST_STEP} minutes more">+</button>` : time, !watch)}
    <div class="form-actions focus-card-actions">${toggle}${more}</div>
  </div>${note}`;
}

// "24:59" as one slot per character, so app.js can roll just the digits that change.
export const timeDigits = (text) => [...String(text)]
  .map((c) => `<span class="focus-digit"><span>${escapeHtml(c)}</span></span>`).join("");

// The ring with whatever sits inside it. share: the filled part, 0 to 100, drawn from 12
// o'clock; live: whether app.js keeps it moving (only a running countdown).
function focusDial(share, inside, live = false) {
  return `<div class="focus-card-dial">
      <svg class="focus-card-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="focus-ring-track" cx="50" cy="50" r="47" pathLength="100"/>
        <circle class="focus-ring-fill"${live ? " data-timer-ring" : ""} cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="${share} 100"/>
      </svg>
      ${inside}
    </div>`;
}

// "25" -> "25:00", the idle ring's reading for a length.
const lengthText = (minutes) => `${String(minutes).padStart(2, "0")}:00`;

// Idle: one form per mode. The Timer's reading is a button that swaps the ring for the
// minute wheel (one scrolling column, the chosen row centred, neighbours fading, "mins"
// beside it) and back. The wheel's radios and the exact-minutes box are the form's length.
// Pomos for the chosen task, after TickTick's estimated pomos: how many are done and how
// many are planned, with − / + to change the plan (0 clears it).
export function renderTaskEstimate(name, done = 0, planned = 0) {
  if (!name) return "";
  const said = planned ? `${done} of ${planned} pomos done` : `${done} ${done === 1 ? "pomo" : "pomos"} done, none planned`;
  return `<div class="task-estimate" data-task-estimate data-task="${escapeHtml(name)}">
      <span class="task-estimate-count">${escapeHtml(said)}</span>
      <span class="task-estimate-step">
        <button type="button" class="focus-icon-btn" data-estimate-step="-1" aria-label="Plan one pomo fewer"${planned ? "" : " disabled"}><span aria-hidden="true">−</span></button>
        <span class="visually-hidden">Planned: ${planned}</span>
        <button type="button" class="focus-icon-btn" data-estimate-step="1" aria-label="Plan one pomo more"${planned >= 20 ? " disabled" : ""}><span aria-hidden="true">+</span></button>
      </span>
    </div>`;
}

function focusCardStart(areaId, timer, tasks, goals, mode, areaOptions, sources = {}) {
  const done = timer.phase === "done" && timer.area === areaId;
  const minutes = done ? timer.minutes : 25;
  const own = LENGTHS.includes(minutes) ? "" : String(minutes);
  const wheel = Array.from({ length: MAX_MINUTES }, (_, i) => i + 1).map((n) => `<label class="wheel-option">
      <input type="radio" name="focus-minutes" value="${n}"${n === minutes ? " checked" : ""}>
      <span>${n}<span class="visually-hidden"> minutes</span></span>
    </label>`).join("");
  const chosen = done ? timer.task : sources.preset || null;
  const area = escapeHtml(areaId);
  const formGoals = areaId === "study" ? goals : [];
  const areaSwitch = (name) => areaOptions ? renderFocusAreaPicker(areaOptions, areaId, name) : "";
  const taskLine = (id) => `<div class="focus-task-picker">${renderTaskPopover(id, tasks, formGoals, chosen, sources)}</div>`;
  const tabs = FOCUS_MODES.map(([key, label]) => `<button type="button" class="segment" role="tab" id="focus-tab-${key}"
      aria-controls="focus-pane-${key}" aria-selected="${key === mode}" tabindex="${key === mode ? 0 : -1}" data-tab="${key}">${key === "timer" ? "Pomo" : label}</button>`).join("");
  const timerDial = focusDial(100, `<button type="button" class="focus-card-trigger" data-focus-card-open
        aria-expanded="false" aria-controls="focus-card-picker">
        <span class="visually-hidden">Session length </span><span class="focus-card-time" data-focus-length>${lengthText(minutes)}</span>
        <span class="focus-card-hint" aria-hidden="true">Set time</span>
      </button>
      <div class="focus-card-picker" id="focus-card-picker">
        <fieldset class="focus-wheel-field">
          <legend class="visually-hidden">Minutes</legend>
          <div class="focus-wheel" data-focus-wheel><div class="focus-wheel-list">${wheel}</div></div>
          <span class="focus-wheel-unit" aria-hidden="true">mins</span>
        </fieldset>
        <div class="focus-own-wrap">
          <button type="button" class="focus-own-open" data-pop-open aria-expanded="false" aria-controls="focus-own-pop">Type a time</button>
          <div class="pop own-pop" id="focus-own-pop" role="dialog" aria-label="Exact length" hidden>
            <label for="focus-own">Exact length</label>
            <div class="input-unit">
              <input id="focus-own" name="focus-own" type="number" min="1" max="${MAX_MINUTES}" step="1" inputmode="numeric" value="${own}" placeholder="25" aria-describedby="focus-own-hint">
              <span class="unit">min</span>
            </div>
            <button type="button" class="btn btn-main own-pop-done" data-own-done>Set</button>
          </div>
        </div>
      </div>`);
  return `<div class="focus-card" data-state="idle" data-phase="idle" data-open="false">
    <div class="segmented focus-card-mode" role="tablist" aria-label="Focus mode" data-tabs="focus-${area}">${tabs}</div>
    <div class="focus-pane" id="focus-pane-timer" role="tabpanel" aria-labelledby="focus-tab-timer"${mode === "timer" ? "" : " hidden"}>
      <form id="focus-form" class="focus-form focus-card-form" data-area="${area}" novalidate>
        ${areaSwitch("focus-area")}
        ${taskLine("focus-task")}
        <div class="task-estimate-slot" data-task-estimate-slot>${renderTaskEstimate(chosen, sources.pomos?.[chosen] || 0, sources.estimates?.[chosen] || 0)}</div>
        ${done ? `<p class="focus-note">Round done: ${roundSize(timer)} sessions. Take a proper break.</p>` : ""}
        ${timerDial}
        <p class="hint focus-card-note" id="focus-own-hint">1 to ${MAX_MINUTES} minutes, in rounds with breaks between.</p>
        <div class="form-actions focus-card-actions">
          <button type="submit" class="btn btn-main focus-start">${done ? "Start another round" : "Start"}</button>
        </div>
      </form>
    </div>
    <div class="focus-pane" id="focus-pane-stopwatch" role="tabpanel" aria-labelledby="focus-tab-stopwatch"${mode === "stopwatch" ? "" : " hidden"}>
      <form id="watch-form" class="focus-form focus-card-form" data-area="${area}" novalidate>
        ${areaSwitch("watch-area")}
        ${taskLine("watch-task")}
        ${focusDial(0, `<p class="focus-card-time">00:00</p>`)}
        <p class="hint focus-card-note">Counts up until you stop it, for up to ${MAX_MINUTES / 60} hours. Stop saves the whole minutes.</p>
        <div class="form-actions focus-card-actions">
          <button type="submit" class="btn btn-main focus-start">Start</button>
        </div>
      </form>
    </div>
  </div>`;
}

// Home: today's focus sessions in one line, and the timer if one is running.
// focus: the dashboard's { today: { count, minutes, study, work } }.
export function renderFocusSummary(focus, timer = IDLE, now = 0, toFocus = true) {
  const today = focus.today;
  let line = "No focus sessions yet today.";
  if (today.count > 0) {
    const parts = Object.entries(SESSION_AREAS).filter(([id]) => today[id] > 0)
      .map(([id, label]) => `${label} ${durationText(today[id])}`);
    line = `Focus sessions today: ${today.count}, ${durationText(today.minutes)}`
      + (parts.length > 1 ? ` (${parts.join(", ")})` : "") + ".";
  }
  const open = toFocus ? ` <a href="#/focus">Open Focus</a>` : "";
  return `<p class="focus-summary-line">${escapeHtml(line)}${open}</p>${timerLine(timer, now, toFocus)}`;
}

// --- The Focus page ---

// Today and this week, with the Study/Work split beside each total.
// The daily goal: today's minutes against it, as a bar. Nothing when no goal is set.
export function renderFocusGoal(minutes, goal) {
  if (!goal) return "";
  const percent = Math.min(100, Math.round((minutes / goal) * 100));
  const left = goal - minutes;
  return `<div class="focus-goal">
      <p class="focus-goal-head"><span>Daily goal</span><span>${escapeHtml(durationText(minutes))} of ${escapeHtml(durationText(goal))}</span></p>
      <div class="level-bar focus-goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"
        aria-label="Today's focus against your daily goal"><span style="--share: ${percent}%"></span></div>
      <p class="focus-goal-note">${left > 0 ? `${escapeHtml(durationText(left))} to go` : "Goal reached for today."}</p>
    </div>`;
}

export function renderFocusTotals(data, goal = 0) {
  const split = (group) => Object.entries(SESSION_AREAS)
    .filter(([id]) => group[id] > 0)
    .map(([id, name]) => `${name} ${durationText(group[id])}`)
    .join(" · ") || "Nothing logged";
  const tile = (label, value, detail) => `<div class="focus-stat">
    <h3>${label}</h3>
    <p class="focus-stat-value">${escapeHtml(value)}</p>
    <p class="focus-stat-detail">${escapeHtml(detail)}</p>
  </div>`;
  const { today, week } = data.summary;
  return `<section class="panel focus-totals" id="focus-page-totals" aria-labelledby="focus-totals-title">
    <h2 id="focus-totals-title">Overview</h2>
    ${renderFocusGoal(today.minutes, goal)}
    <div class="focus-stat-grid">
      ${tile("Today's Pomo", String(today.count), today.count === 1 ? "session" : "sessions")}
      ${tile("Today's Focus", durationText(today.minutes), split(today))}
      ${tile("Week's Pomo", String(week.count), week.count === 1 ? "session" : "sessions")}
      ${tile("Week's Focus", durationText(week.minutes), split(week))}
    </div>
  </section>`;
}

// "15:38" and 45 minutes -> "14:53", the time a session began (wrapping past midnight).
export function startedAt(endedAt, minutes) {
  const [h, m] = String(endedAt).split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return endedAt;
  const start = (((h * 60 + m - Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
}

// What an Edit button (or the note prompt) carries to the record dialog.
const editAttrs = (date, s) => `data-record-edit data-session-date="${escapeHtml(date)}" data-session-id="${escapeHtml(s.id)}"
              data-start="${escapeHtml(startedAt(s.ended_at, s.minutes))}" data-end="${escapeHtml(s.ended_at)}"
              data-task="${escapeHtml(s.task || "")}" data-note="${escapeHtml(s.note || "")}"
              aria-controls="focus-record-pop" aria-expanded="false"`;

// The last 14 days of sessions, newest day first. Any day in the log can have a session
// removed, not just today, so each button carries the day it belongs to.
// notePrompt: { date, id } of a session just saved, to offer "Add a note" (after TickTick's
// focus note at the end of a pomo); nothing once that session has a note.
export function renderFocusLog(data, today, notePrompt = null) {
  const days = data.log || [];
  const prompted = notePrompt && days.find((d) => d.date === notePrompt.date)?.sessions
    ?.find((s) => s.id === notePrompt.id && !s.note);
  const prompt = prompted ? `<div class="focus-note-prompt">
      <span>Your ${escapeHtml(durationText(prompted.minutes))} session is saved.</span>
      <button type="button" class="btn btn-small" ${editAttrs(notePrompt.date, prompted)} data-focus-note>Add a note</button>
      <button type="button" class="focus-icon-btn focus-note-dismiss" data-note-dismiss aria-label="No note for this session"><span aria-hidden="true">×</span></button>
    </div>` : "";
  const body = days.length === 0
    ? `<p class="empty">No focus sessions yet.</p>`
    : days.map((entry) => {
      const label = dayLabel(entry.date, today);
      const items = (entry.sessions || []).map((s) => {
        const length = durationText(s.minutes);
        const area = SESSION_AREAS[s.area] || s.area;
        const said = `Remove the ${length} ${area} session from ${label} at ${s.ended_at}`;
        return `<li class="focus-record-item" data-area="${escapeHtml(s.area)}">
          <span class="focus-record-time">${escapeHtml(startedAt(s.ended_at, s.minutes))} – ${escapeHtml(s.ended_at)}</span>
          <span class="focus-record-length">${escapeHtml(length)}</span>
          <span class="focus-record-task"><span class="focus-area-name">${escapeHtml(area)}</span> ${escapeHtml(s.task || "No task")}</span>
          ${s.note ? `<span class="focus-record-note">${escapeHtml(s.note)}</span>` : ""}
          <span class="focus-record-actions">
            <button type="button" class="btn btn-ghost btn-small focus-record-remove" ${editAttrs(entry.date, s)}
              aria-label="${escapeHtml(`Edit the ${length} ${area} session from ${label} at ${s.ended_at}`)}">Edit</button>
            <button type="button" class="btn btn-ghost btn-small focus-record-remove" data-session-date="${escapeHtml(entry.date)}"
              data-session-remove="${escapeHtml(s.id)}" aria-label="${escapeHtml(said)}">Remove</button>
          </span>
        </li>`;
      }).join("");
      return `<section class="focus-log-day">
        <h3>${escapeHtml(label)}<span class="focus-day-total">${escapeHtml(durationText(entry.minutes))}</span></h3>
        <ul class="focus-record">${items}</ul>
      </section>`;
    }).join("");
  return `<section class="panel focus-log" id="focus-page-log" aria-labelledby="focus-log-title">
    <div class="focus-log-head">
      <h2 id="focus-log-title">Focus record</h2>
      <button type="button" class="focus-record-add" data-record-add aria-controls="focus-record-pop" aria-expanded="false">+ Add</button>
    </div>
    ${prompt}
    ${body}
  </section>`;
}

// Study and Work stack in one bar per day or week. The screen-reader line names both
// series; the visible number is their total in hours.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const clockMinutes = (text) => {
  const [h, m] = String(text).split(":").map(Number);
  return h * 60 + m;
};
const percent = (n) => `${Math.round(n * 10000) / 100}%`;

// "2026-11-22" -> the dates of the count days ending there, newest first.
function datesBack(today, count) {
  const out = [];
  const date = new Date(`${today}T00:00`);
  for (let i = 0; i < count; i += 1) {
    out.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    date.setDate(date.getDate() - 1);
  }
  return out;
}

// TickTick's Focus Timeline: each of the last count days as a 24-hour track with its
// sessions drawn where they ran, in the module's colour. A session over midnight shows on
// both ends. Pointing at a block names its time and task.
export function renderFocusTimeline(data, today, count = 7) {
  const byDate = Object.fromEntries((data.log || []).map((d) => [d.date, d.sessions || []]));
  const rows = datesBack(today, count).map((date) => {
    const label = dayLabel(date, today);
    const sessions = byDate[date] || [];
    const blocks = sessions.flatMap((s) => {
      const end = clockMinutes(s.ended_at);
      const start = end - s.minutes;
      const parts = start >= 0 ? [[start, end]] : [[0, end], [1440 + start, 1440]];
      const tip = `${SESSION_AREAS[s.area] || s.area} ${startedAt(s.ended_at, s.minutes)}–${s.ended_at} · ${s.task || "No task"}`;
      return parts.map(([a, b]) => `<span class="timeline-block" data-area="${escapeHtml(s.area)}"
        style="left:${percent(a / 1440)};width:${percent(Math.max(b - a, 4) / 1440)}" title="${escapeHtml(tip)}"></span>`);
    }).join("");
    const said = sessions.length === 0 ? "no sessions"
      : sessions.map((s) => `${SESSION_AREAS[s.area] || s.area} ${startedAt(s.ended_at, s.minutes)} to ${s.ended_at}`).join(", ");
    return `<li class="timeline-row">
        <span class="timeline-day" aria-hidden="true">${escapeHtml(label)}</span>
        <span class="timeline-track" aria-hidden="true">${blocks}</span>
        <span class="visually-hidden">${escapeHtml(`${label}: ${said}`)}</span>
      </li>`;
  }).join("");
  return `<div class="focus-chart-block focus-timeline">
      <h3>Focus timeline</h3>
      <p class="focus-chart-note">The last ${count} days, midnight to midnight</p>
      <ul class="timeline-rows">${rows}</ul>
      ${hourAxis()}
    </div>`;
}

const hourAxis = () => `<p class="timeline-axis" aria-hidden="true">${["00", "03", "06", "09", "12", "15", "18", "21", "24"]
  .map((t) => `<span>${t}</span>`).join("")}</p>`;

// Most focused time: minutes per hour of the day over 12 weeks, the busiest hour named.
export function renderFocusHours(data) {
  const hours = data.hours || [];
  const top = Math.max(0, ...hours);
  if (top === 0) {
    return `<div class="focus-chart-block focus-hours"><h3>Most focused time</h3>
      <p class="empty">No sessions in the last 12 weeks.</p></div>`;
  }
  const peak = hours.indexOf(top);
  const hh = (h) => `${String(h % 24).padStart(2, "0")}:00`;
  const bars = hours.map((m, h) => `<span class="hour-bar${h === peak ? " is-peak" : ""}"
      style="height:${percent(m ? Math.max(m / top, 0.04) : 0)}" title="${hh(h)}–${hh(h + 1)}: ${escapeHtml(durationText(m))}"></span>`).join("");
  return `<div class="focus-chart-block focus-hours">
      <h3>Most focused time</h3>
      <p class="focus-hours-peak">${hh(peak)}–${hh(peak + 1)} <span>· ${escapeHtml(durationText(top))} over 12 weeks</span></p>
      <div class="hour-bars" aria-hidden="true">${bars}</div>
      ${hourAxis()}
    </div>`;
}

// TickTick's Year Grids: the last 53 weeks, a square a day (Monday at the top), brighter for
// longer focus, with the months along the top. A day with no sessions is a real zero.
export function renderFocusYear(data) {
  const year = data.year || [];
  if (year.length === 0) return "";
  const level = (m) => (m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4);
  const first = new Date(`${year[0].date}T00:00`);
  const pad = (first.getDay() + 6) % 7; // Monday = 0
  const columns = Math.ceil((pad + year.length) / 7);
  const months = [];
  const cells = year.map((d, i) => {
    const date = new Date(`${d.date}T00:00`);
    if (date.getDate() === 1) months.push(`<span style="grid-column:${Math.floor((pad + i) / 7) + 1}">${MONTHS[date.getMonth()]}</span>`);
    const said = `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}: ${d.minutes ? durationText(d.minutes) : "no focus"}`;
    return `<span class="year-cell" data-level="${level(d.minutes)}" title="${escapeHtml(said)}"></span>`;
  }).join("");
  const days = year.filter((d) => d.minutes > 0).length;
  const total = year.reduce((sum, d) => sum + d.minutes, 0);
  const scale = [0, 1, 2, 3, 4].map((n) => `<span class="year-cell" data-level="${n}"></span>`).join("");
  return `<div class="focus-chart-block focus-year">
      <h3>Year</h3>
      <p class="focus-year-sum">${days} ${days === 1 ? "day" : "days"} with focus · ${escapeHtml(durationText(total))}</p>
      <div class="year-box">
      <div class="year-wrap" style="--cols:${columns}">
        <span class="year-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></span>
        <div class="year-main">
          <div class="year-months" aria-hidden="true">${months.join("")}</div>
          <div class="year-grid" role="img" aria-label="${escapeHtml(`The last 53 weeks: ${days} ${days === 1 ? "day" : "days"} with focus, ${durationText(total)} in all.`)}">${`<span class="year-cell is-blank"></span>`.repeat(pad)}${cells}</div>
        </div>
      </div>
      <p class="year-scale" aria-hidden="true">Less ${scale} More</p>
      </div>
    </div>`;
}

// The Add / Edit record dialog, after TickTick's "+ Add Record" and "Edit Focus Duration".
// app.js fills it for an edit (start, end, task); the day and area of a saved session stay.
export function renderRecordPop(areas, today) {
  const areaField = areas.length > 1
    ? `<fieldset class="mood focus-area-picker record-areas" data-record-new-only>
        <legend>Area</legend>
        <div class="mood-options">${areas.map((a, i) => `<label class="mood-option">
          <input type="radio" name="record-area" value="${escapeHtml(a.id)}"${i === 0 ? " checked" : ""}><span>${escapeHtml(a.label)}</span>
        </label>`).join("")}</div>
      </fieldset>`
    : `<input type="hidden" name="record-area" value="${escapeHtml(areas[0]?.id || "study")}">`;
  return `<div class="pop record-pop" id="focus-record-pop" role="dialog" aria-labelledby="record-pop-title" hidden>
    <form id="record-form" novalidate>
      <p class="record-pop-title" id="record-pop-title">Add a focus record</p>
      ${areaField}
      <div class="field" data-record-new-only>
        <label for="record-date">Day it started</label>
        <input id="record-date" name="record-date" type="date" max="${escapeHtml(today)}" value="${escapeHtml(today)}">
      </div>
      <div class="record-times">
        <div class="field"><label for="record-start">Start</label><input id="record-start" type="text" inputmode="numeric" placeholder="09:00" autocomplete="off" data-time aria-describedby="record-error"></div>
        <div class="field"><label for="record-end">End</label><input id="record-end" type="text" inputmode="numeric" placeholder="09:25" autocomplete="off" data-time aria-describedby="record-error"></div>
      </div>
      <div class="field">
        <label for="record-task">Task</label>
        <input id="record-task" type="text" maxlength="200" placeholder="No task" autocomplete="off">
      </div>
      <div class="field">
        <label for="record-note">Note</label>
        <textarea id="record-note" maxlength="500" rows="2" placeholder="What did you get done?"></textarea>
      </div>
      <p class="record-error" id="record-error" role="alert"></p>
      <div class="record-actions">
        <button type="button" class="btn" data-record-cancel>Cancel</button>
        <button type="submit" class="btn btn-main">Save</button>
      </div>
    </form>
  </div>`;
}

// The 7-day and 12-week stacked bars, shared by the rail's Charts tab and the stats page.
function focusWeekBars(data) {
  const weeks = data.weeks || [];
  const bars = weeks.map((w, i) => ({
    value: (w.study || 0) / 60, value2: (w.work || 0) / 60,
    label: i % 4 === 0 || i === weeks.length - 1 ? w.label : "",
    said: `Week of ${w.label}: Study ${durationText(w.study || 0)}, Work ${durationText(w.work || 0)}`,
  }));
  return barChart(bars, null, { listClass: "week-bars week-bars-compact focus-bars", itemClass: "week-bar history-bar" });
}

const focusKey = () => `<p class="chart-key focus-key"><span class="focus-swatch study" aria-hidden="true"></span>Study
      <span class="focus-swatch work" aria-hidden="true"></span>Work</p>`;

// The Focus stats page (#/focus/stats), like TickTick's separate Statistics page: full
// width, with totals, the Day / Week / Month view with its arrows, achievements, most
// focused time, the year grid, a 14-day timeline and the 12-week bars.
// options: view ({ period, offset }), goal (daily minutes, 0 for none), goalNames (Study goals).
export function renderFocusStatsPage(data, today, options = {}) {
  const { view = { period: "week", offset: 0 }, goal = 0, goalNames = [] } = options;
  const year = data.year || [];
  const sumOf = (list) => list.reduce((total, d) => total + d.minutes, 0);
  const month = sumOf(year.filter((d) => d.date >= `${today.slice(0, 7)}-01`));
  const thisYear = sumOf(year.filter((d) => d.date >= `${today.slice(0, 4)}-01-01`));
  const { longest, current } = focusStreaks(year, goal);
  const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;
  const week = data.summary?.week || { count: 0, minutes: 0 };
  return `<div class="stats-page">
    <section class="stats-totals" aria-label="Totals">
      ${statTile("Last 7 days", durationText(week.minutes), `${week.count} ${week.count === 1 ? "session" : "sessions"}`)}
      ${statTile(`This month (${MONTHS[Number(today.slice(5, 7)) - 1]})`, durationText(month), "since the 1st")}
      ${statTile(`This year (${today.slice(0, 4)})`, durationText(thisYear), "since 1 January")}
      ${statTile(goal > 0 ? "Longest goal streak" : "Longest streak", days(longest), `now ${days(current)}`)}
    </section>
    ${renderStatsPeriod(data, today, view, { goal, goalNames })}
    <div class="stats-pair">
      ${data.achievements ? renderFocusAchievements(data.achievements) : ""}
      <section class="stats-card">${renderFocusHours(data)}</section>
    </div>
    <section class="stats-card stats-wide">${renderFocusYear(data)}</section>
    <section class="stats-card stats-wide">${renderFocusTimeline(data, today, 14)}</section>
    <section class="stats-card stats-wide focus-chart-block"><h3>Last 12 weeks</h3>${focusWeekBars(data)}${focusKey()}</section>
  </div>`;
}

const statTile = (label, value, detail) => `<div class="focus-stat">
      <h3>${escapeHtml(label)}</h3>
      <p class="focus-stat-value">${escapeHtml(value)}</p>
      <p class="focus-stat-detail">${escapeHtml(detail)}</p>
    </div>`;

const PERIOD_WORDS = { day: "Day", week: "Week", month: "Month" };

// The Day / Week / Month view: ‹ › to step back and forward, the period's totals, its bars,
// a ring of Study against Work and the tasks ranked by time. Drawn again on its own when
// the period changes (app.js swaps #stats-period).
export function renderStatsPeriod(data, today, view, { goal = 0, goalNames = [] } = {}) {
  const { period, offset } = view;
  const p = focusPeriod(data.sessions || [], today, period, offset, { goal, goalNames });
  const earliest = data.year?.[0]?.date || today;
  const can = canStep(period, offset, today, earliest);
  const word = PERIOD_WORDS[period].toLowerCase();
  const tabs = PERIODS.map((key) => `<button type="button" class="segment" data-stats-period="${key}"
        aria-pressed="${key === period}">${PERIOD_WORDS[key]}</button>`).join("");
  const step = (dir, label, glyph, ok) => `<button type="button" class="focus-icon-btn stats-step" data-stats-step="${dir}"
        aria-label="${label} ${word}"${ok ? "" : " disabled"}><span aria-hidden="true">${glyph}</span></button>`;

  const third = period === "day"
    ? statTile("Longest session", durationText(p.longest), p.count ? "in one go" : "no sessions")
    : statTile("Daily average", durationText(p.average), `over ${p.days} ${p.days === 1 ? "day" : "days"}`);
  const fourth = p.goalDays !== null
    ? statTile("Goal met", `${p.goalDays} of ${p.days}`, `days at ${durationText(goal)}`)
    : statTile("Days with focus", `${p.activeDays} of ${p.days}`, period === "day" ? "today's date" : "so far");

  return `<section class="stats-card stats-wide stats-period" id="stats-period" aria-labelledby="stats-period-title">
    <div class="stats-period-head">
      <div class="segmented stats-period-tabs" role="group" aria-label="Period">${tabs}</div>
      <div class="stats-period-nav">
        ${step(-1, "Previous", "‹", can.back)}
        <h2 id="stats-period-title" aria-live="polite">${escapeHtml(p.label)}</h2>
        ${step(1, "Next", "›", can.forward)}
      </div>
    </div>
    <div class="stats-period-tiles">
      ${statTile("Focus time", durationText(p.minutes), `${SESSION_AREAS.study} ${durationText(p.byArea.study)} · ${SESSION_AREAS.work} ${durationText(p.byArea.work)}`)}
      ${statTile("Sessions", String(p.count), p.count === 1 ? "session" : "sessions")}
      ${third}
      ${fourth}
    </div>
    <div class="stats-period-body">
      <div class="focus-chart-block stats-period-trend">
        <h3>${period === "day" ? "By hour" : "By day"}</h3>
        ${periodBars(p, today, goal)}
        ${focusKey()}
      </div>
      <div class="stats-period-split">
        <h3>Focus split</h3>
        ${focusDonut(p)}
        ${taskRanking(p)}
      </div>
    </div>
  </section>`;
}

// The period's bars: minutes per hour for a Day, hours per day for a Week or Month, with the
// daily goal as the dashed line on a Week or Month.
function periodBars(p, today, goal) {
  const day = p.period === "day";
  const items = p.buckets.map((b, i) => {
    let label = b.label;
    let said;
    if (day) {
      label = i % 3 === 0 ? b.label : "";
      said = `${b.label}:00: Study ${durationText(b.study)}, Work ${durationText(b.work)}`;
    } else {
      const d = new Date(`${b.key}T00:00`);
      label = p.period === "week" ? DAY_NAMES[d.getDay()] : (d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : "");
      said = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}: Study ${durationText(b.study)}, Work ${durationText(b.work)}`;
    }
    const scale = day ? 1 : 60;
    return { value: b.study / scale, value2: b.work / scale, label, said, today: !day && b.key === today };
  });
  const target = !day && goal > 0 ? goal / 60 : null;
  const dense = p.period !== "week";
  const chart = barChart(items, target, { listClass: `week-bars focus-bars stats-period-bars${dense ? " is-dense" : ""}`, itemClass: "week-bar" });
  // One column per bar: 24 hours, or the month's days.
  return dense ? `<div class="stats-period-chart" style="--bars: ${items.length}">${chart}</div>` : chart;
}

// A ring of Study against Work, the total in the middle.
function focusDonut(p) {
  const total = p.minutes;
  const share = (m) => (total > 0 ? Math.round((m / total) * 1000) / 10 : 0);
  const study = share(p.byArea.study);
  const work = total > 0 ? Math.round((100 - study) * 10) / 10 : 0;
  const arc = (cls, length, offset) => (length > 0
    ? `<circle class="donut-arc ${cls}" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}"/>`
    : "");
  const said = total > 0
    ? `${durationText(total)} in all: Study ${durationText(p.byArea.study)} (${Math.round(study)}%), Work ${durationText(p.byArea.work)} (${Math.round(work)}%).`
    : "No focus in this period.";
  return `<figure class="focus-donut" role="img" aria-label="${escapeHtml(said)}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="donut-track" cx="50" cy="50" r="40"/>
        ${arc("study", study, 0)}${arc("work", work, study)}
      </svg>
      <figcaption aria-hidden="true"><strong>${escapeHtml(durationText(total))}</strong><span>${p.count} ${p.count === 1 ? "session" : "sessions"}</span></figcaption>
    </figure>`;
}

// The tasks ranked by time, each with its share of the period, top 8.
function taskRanking(p) {
  if (p.tasks.length === 0) return `<p class="empty">No sessions in this period.</p>`;
  const top = p.tasks[0].minutes || 1;
  return `<ol class="task-rank">${p.tasks.slice(0, 8).map((row) => {
    const area = SESSION_AREAS[row.area] || row.area;
    const percent = p.minutes > 0 ? Math.round((row.minutes / p.minutes) * 100) : 0;
    return `<li class="task-rank-row" data-area="${escapeHtml(row.area)}">
        <span class="focus-swatch ${escapeHtml(row.area)}" aria-hidden="true"></span>
        <span class="task-rank-name"><span class="focus-area-name">${escapeHtml(area)}</span> ${escapeHtml(row.task || "No task")}</span>
        ${row.goal ? `<span class="focus-task-badge">Study goal</span>` : ""}
        <span class="task-rank-time">${escapeHtml(durationText(row.minutes))} · ${percent}%</span>
        <span class="task-rank-bar" aria-hidden="true"><span style="--share: ${Math.round((row.minutes / top) * 1000) / 10}%"></span></span>
      </li>`;
  }).join("")}</ol>`;
}

// Achievements, after TickTick's levels: the level with progress to the next, and badges.
export function renderFocusAchievements(a) {
  const next = a.next_hours === null
    ? "The top level."
    : `${formatNumber(Math.max(0, Math.round((a.next_hours - a.hours) * 10) / 10))} h to level ${a.level + 1}`;
  const percent = Math.round(a.progress * 100);
  const badges = a.badges.map((b) => `<li class="badge"${b.earned ? " data-earned" : ""}>
        <span class="badge-mark" aria-hidden="true">${b.earned ? "&#10003;" : ""}</span>
        <span class="badge-text"><span class="badge-name">${escapeHtml(b.label)}</span>
        <span class="badge-how">${escapeHtml(b.how)}</span></span>
        <span class="visually-hidden">${b.earned ? "Earned" : "Not yet"}</span>
      </li>`).join("");
  return `<section class="stats-card stats-achievements" aria-labelledby="stats-level-title">
    <div class="level-head">
      <h2 id="stats-level-title">Level ${a.level}</h2>
      <p class="level-meta">${escapeHtml(formatNumber(a.hours))} h of focus · ${escapeHtml(next)}</p>
    </div>
    <div class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"
      aria-label="${a.next_hours === null ? "Top level reached" : `Progress to level ${a.level + 1}`}"><span style="--share: ${percent}%"></span></div>
    <ul class="badge-list" aria-label="Badges">${badges}</ul>
  </section>`;
}

// The whole page, laid out like TickTick's Focus screen: the timer fills the left pane and
// the right pane holds Overview (the tiles and the Focus record) and Charts (the bars and
// time by task). The timer lives in its own holder so a refresh after a saved session can
// replace the numbers without touching a form someone is typing in.
export function renderFocusPage(data, timer, tasks, now, message = "", options = {}) {
  const { areas = [], area = "study", goals = [], mode = "timer", today = "", habits = [], preset = null,
    dailyGoal = 0, notePrompt = null, estimates = {} } = options;
  const picker = areas.length > 1 ? areas : null;
  const sources = { recent: recentTasks(data.log, area), habits, preset, estimates, pomos: pomoCounts(data.sessions || []) };
  const panel = renderFocusCard(area, timer, tasks, now, message, goals, mode, picker, sources);
  return `<div class="focus-page">
    <section class="focus-stage" aria-label="Focus timer">
      <div class="focus-page-head">
        <p class="focus-page-title" aria-hidden="true">Focus</p>
        <div class="focus-page-tools">
          <button type="button" class="focus-icon-btn" data-focus-menu="add" aria-label="Go to the focus record">+</button>
          <a class="focus-icon-btn" href="#/focus/stats" aria-label="Focus statistics" title="Focus statistics">${icon("insights", "focus-icon-svg")}</a>
          <div class="focus-more">
            <button type="button" class="focus-icon-btn" id="focus-more-button" data-focus-menu="toggle"
              aria-haspopup="menu" aria-expanded="false" aria-controls="focus-more-menu" aria-label="More focus options">&#8943;</button>
            <div class="focus-more-menu" id="focus-more-menu" role="menu" hidden>
              <button type="button" role="menuitem" data-focus-menu="record">Focus record</button>
              <button type="button" role="menuitem" data-focus-menu="fullscreen">Full-screen timer</button>
              <button type="button" role="menuitem" data-focus-menu="settings">Timer length</button>
              <button type="button" role="menuitem" data-focus-menu="prefs">Focus settings</button>
            </div>
          </div>
        </div>
      </div>
      <div id="focus-page-timer">${panel}</div>
    </section>
    <aside class="focus-rail" aria-label="Focus time">
      <div class="focus-page-panel">
        ${renderFocusTotals(data, dailyGoal)}
        ${renderFocusLog(data, today, notePrompt)}
      </div>
    </aside>
    ${renderRecordPop(areas.length ? areas : [{ id: area, label: SESSION_AREAS[area] || area }], today)}
  </div>`;
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
  const trend = TREND_WORDS[area.trend] && area.trend !== "none"
    ? `<span class="trend" data-trend="${escapeHtml(area.trend)}">${TREND_WORDS[area.trend]}</span>`
    : "";
  const goals = area.details.goals || [];
  const lines = goals.length > 0
    ? renderStudyGoalList(goals)
    : area.details.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const hasHistory = area.history && area.history.length > 0;
  const chartTab = (range, label, selected) => `<button type="button" class="segment" role="tab" id="chart-tab-${range}"
        aria-controls="chart-${range}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-tab="${range}"><span class="visually-hidden">Last </span>${label}</button>`;
  const chart = `<section class="panel module-chart" aria-labelledby="module-chart-title">
    <div class="panel-head">
      <h2 id="module-chart-title">Over time</h2>
      ${hasHistory ? `<div class="segmented" role="tablist" aria-label="Chart range" data-tabs="chart">
        ${chartTab("days", "7 days", true)}
        ${chartTab("weeks", "12 weeks", false)}
      </div>` : `<p class="stat">Last 7 days</p>`}
    </div>
    ${baselineLine(area.learning, area.usual && { ...area.usual, text: area.usual.text.split(" \u00b7 ").slice(0, 2).join(" \u00b7 ") })}
    <div class="chart-panel" id="chart-days"${hasHistory ? ` role="tabpanel" aria-labelledby="chart-tab-days"` : ""}>
      ${weekBars(area, dates, today)}
    </div>
    ${hasHistory ? `<div class="chart-panel" id="chart-weeks" role="tabpanel" aria-labelledby="chart-tab-weeks" hidden>
      ${historyBars(area)}
      ${area.usual ? `<p class="hint chart-key"><span class="usual-swatch" aria-hidden="true"></span>Shaded: your usual range, ${escapeHtml(usualSpan(area))}</p>` : ""}
    </div>` : ""}
  </section>`;

  const top = hero({
    kicker: area.period,
    label: `${area.label} this week`,
    number: hasValue ? formatNumber(area.value) : "-",
    unit: hasValue ? `<span class="unit">${escapeHtml(area.unit)}</span>` : "",
    headline: area.headline,
    score: area.score,
    level: area.score_label,
    statusAfter: `${hasScore ? `<span class="visually-hidden">Score ${formatNumber(area.score)}, ${escapeHtml(target)}</span>` : ""}${trend}`,
    extra: ringPills(area.contributors || [], area.id),
  });
  const restDays = area.rest_days ? `<p>${area.rest_days} rest day${area.rest_days === 1 ? "" : "s"} this week</p>` : "";
  const guidance = area.guidance ? `<p class="hero-note">${escapeHtml(area.guidance)}</p>` : "";

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

  // On Study and Work the timer is the page's main action, so Save is a plain white pill.
  const log = `<section class="panel module-log" aria-labelledby="module-log-title">
    <h2 id="module-log-title">${area.id === "sleep" ? "Log last night" : "Log today"}</h2>
    <form id="module-log-form" data-area="${id}" novalidate>
      ${moduleLogFields(area.id, day, settings)}
      <div class="form-actions">
        <button type="submit" class="btn ${timed ? "btn-primary" : "btn-main"}">Save</button>
        <p class="save-status" id="module-log-status" role="status" aria-live="polite"></p>
      </div>
    </form>
    ${timed ? `<p class="hint focus-breakdown" id="focus-breakdown"${breakdown ? "" : " hidden"}>${escapeHtml(breakdown)}</p>` : ""}
  </section>`;
  const details = `<section class="panel panel-quiet module-details" id="module-details" aria-labelledby="module-details-title">
    <h2 id="module-details-title">${escapeHtml(area.details.title)}</h2>
    ${guidance}
    ${lines}
    ${restDays}
    <div class="form-actions">
      <button type="button" class="btn" id="module-edit">Edit ${escapeHtml(area.label.toLowerCase())}</button>
    </div>
  </section>`;
  const contributors = `<section class="panel panel-quiet module-contributors" aria-labelledby="module-contributors-title">
    <h2 id="module-contributors-title">Contributors</h2>
    ${contributorList(area.contributors || [])}
  </section>`;

  // Wide screens: a side column (timer, log, details) and a main column (chart, contributors).
  // Study and Work carry the timer, so their details move under the contributors to keep the
  // two columns even; phones still show log, details, chart, contributors (see .module-timed).
  return `${top}
  <div class="module-layout${timed ? " module-timed" : ""}">
    <div class="module-side">
  ${focus}
  ${log}
  ${timed ? "" : details}
    </div>
    <div class="module-main">
  ${chart}
  ${contributors}
  ${timed ? details : ""}
    </div>
  </div>`;
}

// The parts of a module page a refresh swaps one by one, in page order.
export const MODULE_PARTS = ":scope > .hero, .module-side > section, .module-main > section";

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

  // Wide screens: the week and its patterns in the side column, streaks and the Focus Report
  // beside them. Phones read them in this same order.
  return `${top}
  <div class="page-layout">
    <div class="page-side">
  <section class="panel" aria-labelledby="review-title">
    <h2 id="review-title">This week</h2>
    <ul class="review-list">${rows}</ul>
    ${extras}
    ${change}
  </section>
  <section class="panel panel-quiet" aria-labelledby="patterns-title">
    <h2 id="patterns-title">Patterns</h2>
    ${patternItems}
  </section>
    </div>
    <div class="page-main">
  <section class="panel" aria-labelledby="streaks-title">
    <h2 id="streaks-title">Streaks</h2>
    <p class="hint">One missed day only fades a streak; do it the next day to revive it. Rest days don't count against you.</p>
    <ul class="streak-list">${streakItems}</ul>
    ${renderShield(data.shield, data.date)}
  </section>
  ${renderFocusReport(data.focus_report)}
    </div>
  </div>`;
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

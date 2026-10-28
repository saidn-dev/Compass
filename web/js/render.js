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

// "7.5 h", "8,000 steps", "100%"
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
    const name = capitalize(f.area_id);
    const when = f.date ? ` on ${f.date}` : "";
    const rule = f.mode === "limit" ? "limit" : "target";
    return `<li>${escapeHtml(name)}${escapeHtml(when)}: ${formatNumber(f.value)} (${rule} ${formatNumber(f.target)})</li>`;
  }).join("");

  return `<div class="brief">${sentences}
    <details class="brief-facts"><summary>Numbers used</summary><ul>${facts}</ul></details>
  </div>`;
}

export function renderAreaCard(area) {
  const statusKey = STATUS_KEYS[area.status] || "no_data";
  const hasValue = area.value !== null && area.value !== undefined;
  const value = hasValue ? formatNumber(area.value) : "-";
  const unit = hasValue ? `<span class="unit">${escapeHtml(area.unit)}</span>` : "";
  const target = targetText(area.target, area.mode, area.unit);
  const label = hasValue
    ? `${area.label}: ${withUnit(area.value, area.unit)}, ${target}, ${area.status}`
    : `${area.label}: no data, ${target}`;

  return `<article class="card area-card" data-status="${statusKey}" aria-label="${escapeHtml(label)}">
    <div class="card-head">
      <h3 class="card-title">${escapeHtml(area.label)}</h3>
      <span class="status">${escapeHtml(area.status)}</span>
    </div>
    <p class="card-value"><span class="value">${value}</span>${unit}</p>
    <p class="card-target">${escapeHtml(target)}</p>
    ${progressBar(area.progress)}
    <p class="trend" data-trend="${escapeHtml(area.trend)}">${TREND_WORDS[area.trend] || ""}</p>
  </article>`;
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
    <p class="hint">Choose up to 5.</p>
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

// One row per enabled module: target number + "More is better" / "Stay under".
// areas: the full module list; settings: { modules, targets }.
export function renderTargetRows(areas, settings) {
  const rows = settings.modules.map((id) => {
    const area = areas.find((a) => a.id === id);
    if (!area) return "";
    const saved = settings.targets.find((t) => t.area_id === id);
    const target = saved ? saved.target : area.default_target;
    const mode = saved ? saved.mode : area.default_mode;
    const inputId = `target-${escapeHtml(id)}`;
    return `<div class="target-row" data-area="${escapeHtml(id)}">
      <label for="${inputId}">${escapeHtml(area.label)}</label>
      <div class="input-unit">
        <input id="${inputId}" type="number" inputmode="decimal" min="0" step="any" value="${escapeHtml(target)}">
        <span class="unit">${escapeHtml(area.unit)}</span>
      </div>
      <select aria-label="${escapeHtml(area.label)} rule">
        <option value="up"${mode === "up" ? " selected" : ""}>More is better</option>
        <option value="limit"${mode === "limit" ? " selected" : ""}>Stay under</option>
      </select>
    </div>`;
  }).join("");
  return rows || `<p class="empty">Choose some modules first.</p>`;
}

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

// Focus stats: the sums behind the stats page's Day / Week / Month view, after TickTick's
// Statistics page with its ‹ › arrows. No page in here: every function takes the sessions
// and today's date and returns plain numbers, so the tests can pass in anything.
//
// A session here is the payload's { date, area, task, minutes, ended_at, note }, saved on
// the day it started. Weeks start on Monday.

export const PERIODS = ["day", "week", "month"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (key) => new Date(`${key}T00:00`);
const addDays = (key, n) => {
  const d = dateOf(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

// The dates of a period: offset 0 is the one holding today, -1 the one before.
export function periodRange(period, offset, today) {
  let start;
  let length;
  if (period === "day") {
    start = addDays(today, offset);
    length = 1;
  } else if (period === "week") {
    const monday = addDays(today, -((dateOf(today).getDay() + 6) % 7));
    start = addDays(monday, offset * 7);
    length = 7;
  } else {
    const t = dateOf(today);
    const first = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    start = keyOf(first);
    length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  }
  const dates = Array.from({ length }, (_, i) => addDays(start, i));
  return { start, end: dates[dates.length - 1], dates };
}

// "Today", "This week", "November 2026", "9–15 Nov", ...
export function periodLabel(period, offset, range) {
  const start = dateOf(range.start);
  const end = dateOf(range.end);
  if (period === "day") {
    if (offset === 0) return "Today";
    if (offset === -1) return "Yesterday";
    return `${DAY_NAMES[start.getDay()]} ${start.getDate()} ${SHORT_MONTHS[start.getMonth()]}`;
  }
  if (period === "week") {
    if (offset === 0) return "This week";
    if (offset === -1) return "Last week";
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${SHORT_MONTHS[end.getMonth()]}`
      : `${start.getDate()} ${SHORT_MONTHS[start.getMonth()]} – ${end.getDate()} ${SHORT_MONTHS[end.getMonth()]}`;
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
}

const clock = (text) => {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
};

// Minutes in each hour of the day (0-23), each session spread over the hours it ran.
// A session that began before midnight wraps to the evening (like the server's version).
export function minutesByHour(sessions) {
  const hours = Array(24).fill(0);
  for (const s of sessions) {
    const end = clock(s.ended_at);
    for (let minute = end - s.minutes; minute < end; minute += 1) {
      hours[Math.floor((((minute % 1440) + 1440) % 1440) / 60)] += 1;
    }
  }
  return hours;
}

const sum = (list) => list.reduce((total, s) => total + s.minutes, 0);

// Everything the period view shows. goal: the daily goal in minutes (0 for none).
// goalNames: the Study goals, to badge tasks named after one.
export function focusPeriod(sessions, today, period, offset, { goal = 0, goalNames = [] } = {}) {
  const range = periodRange(period, offset, today);
  const inside = sessions.filter((s) => s.date >= range.start && s.date <= range.end);
  const byArea = { study: sum(inside.filter((s) => s.area === "study")), work: sum(inside.filter((s) => s.area === "work")) };

  const rows = new Map();
  for (const s of inside) {
    const key = `${s.area}\u0000${s.task || ""}`;
    const row = rows.get(key) || { area: s.area, task: s.task || null, minutes: 0, count: 0 };
    row.minutes += s.minutes;
    row.count += 1;
    rows.set(key, row);
  }
  const tasks = [...rows.values()]
    .map((row) => ({ ...row, goal: row.area === "study" && goalNames.includes(row.task) }))
    .sort((a, b) => b.minutes - a.minutes || a.area.localeCompare(b.area) || (a.task || "").localeCompare(b.task || ""));

  // The bars: hours of the day for a Day, the days themselves for a Week or Month.
  let buckets;
  if (period === "day") {
    const study = minutesByHour(inside.filter((s) => s.area === "study"));
    const work = minutesByHour(inside.filter((s) => s.area === "work"));
    buckets = study.map((m, hour) => ({ key: String(hour), label: pad(hour), study: m, work: work[hour] }));
  } else {
    buckets = range.dates.map((date) => {
      const day = inside.filter((s) => s.date === date);
      return { key: date, study: sum(day.filter((s) => s.area === "study")), work: sum(day.filter((s) => s.area === "work")) };
    });
  }

  // Averages and the goal count only the days that have begun.
  const elapsed = range.dates.filter((d) => d <= today);
  const perDay = (date) => sum(inside.filter((s) => s.date === date));
  const minutes = byArea.study + byArea.work;
  return {
    period, offset, range, label: periodLabel(period, offset, range),
    minutes, count: inside.length, byArea, tasks, buckets,
    longest: inside.reduce((top, s) => Math.max(top, s.minutes), 0),
    average: elapsed.length > 0 ? Math.round(minutes / elapsed.length) : 0,
    days: elapsed.length,
    activeDays: elapsed.filter((d) => perDay(d) > 0).length,
    goalDays: goal > 0 ? elapsed.filter((d) => perDay(d) >= goal).length : null,
  };
}

// Can the arrows go further? Back stops at the first day the payload holds; forward at today.
export function canStep(period, offset, today, earliest) {
  return {
    back: periodRange(period, offset - 1, today).end >= earliest,
    forward: offset < 0,
  };
}

// Streaks over the year grid ({ date, minutes } oldest first). A day counts when it has any
// focus, or, with a daily goal, when it reaches the goal. The current streak may end
// yesterday: today isn't over yet.
export function focusStreaks(year, goal = 0) {
  const counts = (d) => (goal > 0 ? d.minutes >= goal : d.minutes > 0);
  let longest = 0;
  let run = 0;
  for (const d of year) {
    run = counts(d) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = year.length - 1; i >= 0; i -= 1) {
    if (counts(year[i])) current += 1;
    else if (i < year.length - 1) break;
  }
  return { longest, current };
}

// Sessions per task name, for the pomos done against a task's estimate.
export function pomoCounts(sessions) {
  const counts = {};
  for (const s of sessions) if (s.task) counts[s.task] = (counts[s.task] || 0) + 1;
  return counts;
}

// Goal dates written the way people say them: "in 12 days", "next Monday", "5 Dec".
// Pure functions: "today" is always passed in as "YYYY-MM-DD", never read from the clock.
// Dates are handled in UTC so a clock change can't move a day.

const DAY_MS = 86_400_000;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(key, n) {
  return toKey(new Date(toUtc(key).getTime() + n * DAY_MS));
}

// 0 = Monday ... 6 = Sunday, like the server.
function weekdayOf(key) {
  return (toUtc(key).getUTCDay() + 6) % 7;
}

// A real calendar date or null ("31 Feb" is null).
function makeDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return toKey(date);
}

// "dec", "december", "sept" -> 1-12, or 0 when it isn't a month.
function monthNumber(word) {
  if (word.length < 3) return 0;
  const i = MONTHS.findIndex((m) => m.startsWith(word));
  return i + 1;
}

// "mon", "monday", "tues" -> 0-6, or -1.
function weekdayNumber(word) {
  if (word.length < 3) return -1;
  return WEEKDAYS.findIndex((d) => d.startsWith(word));
}

// A day and month with no year: the next one on or after today (29 Feb waits for a leap year).
function nextDayMonth(month, day, today) {
  const year = toUtc(today).getUTCFullYear();
  for (let y = year; y <= year + 4; y += 1) {
    const date = makeDate(y, month, day);
    if (date !== null && date >= today) return date;
  }
  return null;
}

// What the text means as "YYYY-MM-DD": { date } when it reads as a date, { date: null }
// when it is blank, and null when Compass can't read it.
//   2026-12-05 · today · tomorrow · in 12 days · 3 weeks · in a month
//   monday / this monday (the coming one, today counts) · next monday (never today) · next week
//   5 dec · 5th December · Dec 5 · 5 Dec 2027 (no year: the next one to come)
export function parseDate(text, today) {
  const t = String(text ?? "").trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (t === "") return { date: null };

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return wrap(makeDate(Number(m[1]), Number(m[2]), Number(m[3])));

  if (t === "today") return { date: today };
  if (t === "tomorrow") return { date: addDays(today, 1) };
  if (t === "next week") return { date: addDays(today, 7) };

  m = t.match(/^(?:in )?(\d{1,3}|[a-z]+) (day|week|month)s?$/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    if (!n) return null;
    if (m[2] === "day") return { date: addDays(today, n) };
    if (m[2] === "week") return { date: addDays(today, n * 7) };
    return wrap(addMonths(today, n));
  }

  m = t.match(/^(this |next )?([a-z]+)$/);
  if (m && weekdayNumber(m[2]) !== -1) {
    let ahead = (weekdayNumber(m[2]) - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && m[1] === "next ") ahead = 7;
    return { date: addDays(today, ahead) };
  }

  // "5 dec", "5th of december 2027"
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/);
  if (m && monthNumber(m[2])) return dayMonth(Number(m[1]), monthNumber(m[2]), m[3], today);
  // "dec 5", "december 5th 2027"
  m = t.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (m && monthNumber(m[1])) return dayMonth(Number(m[2]), monthNumber(m[1]), m[3], today);

  return null;
}

function wrap(date) {
  return date === null ? null : { date };
}

function dayMonth(day, month, year, today) {
  return wrap(year ? makeDate(Number(year), month, day) : nextDayMonth(month, day, today));
}

// "in a month" from 31 Jan is the last day of February.
function addMonths(today, n) {
  const d = toUtc(today);
  const total = d.getUTCMonth() + n;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return makeDate(year, month, Math.min(d.getUTCDate(), last));
}

// "Fri 5 Dec 2026 · in 15 days": what a date the user typed was read as.
export function dateHint(date, today) {
  const d = toUtc(date);
  const days = Math.round((d - toUtc(today)) / DAY_MS);
  let when;
  if (days < 0) when = "date passed";
  else if (days === 0) when = "today";
  else if (days === 1) when = "tomorrow";
  else when = `in ${days} days`;
  const label = `${SHORT_DAYS[weekdayOf(date)]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${label} · ${when}`;
}

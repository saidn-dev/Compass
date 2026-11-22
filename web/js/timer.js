// The focus timer's rules: a pomodoro cycle of focus sessions and breaks.
// Session, 5-min break, session, ... a 15-min break after the 4th session, then the cycle stops.
// No page and no clock in here: every function takes `now` (milliseconds) and returns a new
// state without changing the old one, so the tests can pass in any time they like.
//
// A state is one of:
//   { phase: "idle" }
//   { phase: "focus", area, task, minutes, round, date, endsAt, remaining, lastTick }
//   { phase: "break", ...the same, long }       long: the 15-min break after the 4th session
//   { phase: "done", area, task, minutes }       the round of 4 is over
//   { phase: "away", area, task, minutes, pending }  a session ended while the page couldn't watch
//   { phase: "watch", area, task, minutes: 0, date, since, elapsed, lastTick }  the stopwatch
// While paused, endsAt is null and remaining holds the time that was left.
// The stopwatch counts up: while it runs, since is when it would have started had it never
// paused (so now - since is the time counted); while paused, since is null and elapsed holds it.
// round: which session of the round (1 to opts.every); date: the day the session started on.
// opts: the round's options, fixed when it starts (see timerOptions). waiting: true while a
// break or the next session sits at its full length for a press, because auto-start is off.

export const LENGTHS = [15, 25, 50];
// A session is 1 to 180 minutes (the server's limit). A custom length must fit, and the
// stopwatch stops by itself and saves when it reaches the top.
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;
export const isLength = (n) => Number.isInteger(n) && n >= MIN_MINUTES && n <= MAX_MINUTES;
export const AREAS = ["study", "work"];
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
export const SESSIONS_A_ROUND = 4;

// The round's options, after TickTick's Pomo settings: break lengths, a long break after
// every n sessions (which ends the round), whether the break and the next session start by
// themselves, and strict mode (no Pause, Finish early or Reset while a session runs).
export const DEFAULT_OPTIONS = Object.freeze({
  shortBreak: SHORT_BREAK, longBreak: LONG_BREAK, every: SESSIONS_A_ROUND,
  autoBreak: true, autoFocus: true, strict: false,
});
const within = (v, low, high, fallback) => (Number.isInteger(v) && v >= low && v <= high ? v : fallback);

// Options from the settings' focus prefs (short_break, ...) or a saved state's opts
// (shortBreak, ...). Anything missing or out of range takes the default.
export function timerOptions(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pick = (snake, camel) => (r[camel] !== undefined ? r[camel] : r[snake]);
  const flag = (snake, camel, fallback) => (typeof pick(snake, camel) === "boolean" ? pick(snake, camel) : fallback);
  return {
    shortBreak: within(pick("short_break", "shortBreak"), 1, 30, SHORT_BREAK),
    longBreak: within(pick("long_break", "longBreak"), 1, 60, LONG_BREAK),
    every: within(pick("long_break_every", "every"), 2, 8, SESSIONS_A_ROUND),
    autoBreak: flag("auto_break", "autoBreak", true),
    autoFocus: flag("auto_focus", "autoFocus", true),
    strict: flag("strict", "strict", false),
  };
}

const optionsOf = (state) => state.opts || DEFAULT_OPTIONS;
// Sessions in this state's round: 4 unless the options say otherwise.
export const roundSize = (state) => optionsOf(state).every;
// Strict mode, for a running focus session only.
export const isStrict = (state) => state.phase === "focus" && optionsOf(state).strict;
// More than this between two ticks means the laptop slept or the tab was closed. Not less:
// Chrome slows a hidden tab's timers to once a minute, and that is not being away.
export const AWAY_GAP = 3 * 60_000;
const MINUTE = 60_000;

export const IDLE = Object.freeze({ phase: "idle" });

const pad = (n) => String(n).padStart(2, "0");

// A time as the date on this computer's own calendar: "2026-11-19".
export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// A time as "14:05" on this computer's own clock.
export function clockText(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// What is left, as "12:04". Part of a second counts as a whole one, so 0:00 only shows at the end.
export function countdownText(ms) {
  const seconds = ms > 0 ? Math.ceil(ms / 1000) : 0;
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

// Time counted up, as "12:04", or "1:02:09" from an hour on.
export function countupText(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const rest = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  return hours ? `${hours}:${rest}` : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

const timed = (state) => state.phase === "focus" || state.phase === "break";
const watching = (state) => state.phase === "watch";

export const isRunning = (state) => (timed(state) && state.endsAt !== null) || (watching(state) && state.since !== null);
export const isPaused = (state) => (timed(state) && state.endsAt === null) || (watching(state) && state.since === null);

// How long the stopwatch has counted.
export function elapsedMs(state, now) {
  if (!watching(state)) return 0;
  return state.since === null ? state.elapsed : Math.max(0, now - state.since);
}

// What the readout shows: the time left on the timer, the time counted on the stopwatch.
export const readoutText = (state, now) => (watching(state)
  ? countupText(elapsedMs(state, now)) : countdownText(remainingMs(state, now)));

function phaseLength(state) {
  if (state.phase === "focus") return state.minutes * MINUTE;
  const o = optionsOf(state);
  return (state.long ? o.longBreak : o.shortBreak) * MINUTE;
}

// How long the current session or break still has to run.
export function remainingMs(state, now) {
  if (!timed(state)) return 0;
  return state.endsAt === null ? state.remaining : Math.max(0, state.endsAt - now);
}

// The share of the session or break still to go: 1 at the start, 0 at the end (for the ring).
// For the stopwatch it is the share of the current hour, like a clock's minute hand.
export function ringShare(state, now) {
  if (watching(state)) return (elapsedMs(state, now) % (60 * MINUTE)) / (60 * MINUTE);
  return timed(state) ? remainingMs(state, now) / phaseLength(state) : 0;
}

// The session to save: { date, area, task, minutes, ended_at }.
function sessionOf(state, minutes, endMs) {
  return { date: state.date, area: state.area, task: state.task, minutes, ended_at: clockText(endMs) };
}

function focusAt(base, start, round) {
  return {
    phase: "focus", area: base.area, task: base.task, minutes: base.minutes, round,
    date: dateKey(start), endsAt: start + base.minutes * MINUTE, remaining: null, lastTick: start,
    opts: optionsOf(base),
  };
}

function breakAt(state, start) {
  const o = optionsOf(state);
  const long = state.round >= o.every;
  return {
    phase: "break", area: state.area, task: state.task, minutes: state.minutes, round: state.round, long,
    date: state.date, endsAt: start + (long ? o.longBreak : o.shortBreak) * MINUTE, remaining: null, lastTick: start,
    opts: o,
  };
}

// A break or session that waits at its full length for a press (auto-start is off).
const held = (state, now) => ({ ...state, endsAt: null, remaining: phaseLength(state), lastTick: now, waiting: true });

const roundDone = (state) => ({ phase: "done", area: state.area, task: state.task, minutes: state.minutes, opts: optionsOf(state) });

// Starts session 1 of a round. task: the focus task's text, or null for none.
// options: from timerOptions (the defaults when not given).
export function startSession({ area, task = null, minutes, options = DEFAULT_OPTIONS }, now) {
  return focusAt({ area, task: task || null, minutes, opts: timerOptions(options) }, now, 1);
}

// Starts the stopwatch from 0. task: the focus task's text, or null for none.
export function startWatch({ area, task = null }, now) {
  return { phase: "watch", area, task: task || null, minutes: 0, date: dateKey(now), since: now, elapsed: null, lastTick: now };
}

export function pause(state, now) {
  if (!isRunning(state)) return state;
  if (watching(state)) return { ...state, since: null, elapsed: elapsedMs(state, now), lastTick: now };
  return { ...state, endsAt: null, remaining: Math.max(0, state.endsAt - now), lastTick: now };
}

export function resume(state, now) {
  if (!isPaused(state)) return state;
  if (watching(state)) return { ...state, since: now - state.elapsed, elapsed: null, lastTick: now };
  const { waiting, ...rest } = state;
  // A session that waited for a press is saved on the day it really starts.
  const date = waiting && state.phase === "focus" ? dateKey(now) : state.date;
  return { ...rest, date, endsAt: now + state.remaining, remaining: null, lastTick: now };
}

// + / − while a focus session runs, after TickTick's "adjust the time during focus": the
// session gets step minutes longer or shorter, within 1-180 and never shorter than what has
// already run (at least part of a minute stays). Later sessions of the round keep the new
// length. Anything but a focus session is left as it is.
export const ADJUST_STEP = 5;

export function adjust(state, step, now) {
  if (state.phase !== "focus") return state;
  const ran = state.minutes * MINUTE - remainingMs(state, now);
  const shortest = Math.max(1, Math.floor(ran / MINUTE) + 1);
  const minutes = Math.min(MAX_MINUTES, Math.max(shortest, state.minutes + step));
  if (minutes === state.minutes) return state;
  const change = (minutes - state.minutes) * MINUTE;
  return state.endsAt === null
    ? { ...state, minutes, remaining: state.remaining + change }
    : { ...state, minutes, endsAt: state.endsAt + change };
}

// Reset throws the session away; Stop ends the cycle during a break. Neither saves anything.
export const reset = () => IDLE;
export const stopCycle = () => IDLE;

// A stopwatch that went unwatched (laptop asleep, tab closed): only the minutes up to the
// last tick are known to be real, and even those are saved only if the person says so.
// Returns { state, events } like tick: the "Save it?" state, or idle when under a minute.
function watchAway(state) {
  const counted = Math.min(MAX_MINUTES, Math.floor(Math.max(0, state.lastTick - state.since) / MINUTE));
  if (counted < 1) return { state: IDLE, events: [{ type: "watchAway" }] };
  const pending = sessionOf(state, counted, state.lastTick);
  return {
    state: { phase: "away", area: state.area, task: state.task, minutes: counted, pending },
    events: [{ type: "away", session: pending }],
  };
}

const unwatched = (state, now) => isRunning(state) && now - state.lastTick > AWAY_GAP;

// Ends the session now and saves the whole minutes the clock ran. Under a minute saves nothing.
// Returns { state, session } (session is null when there is nothing to save).
// On the stopwatch this is Stop: it saves the whole minutes counted. A stopwatch that went
// unwatched before Stop was pressed goes to "Save it?" instead, with the time up to its last tick.
export function finishEarly(state, now) {
  if (watching(state) && unwatched(state, now)) return { state: watchAway(state).state, session: null };
  if (watching(state)) {
    const minutes = Math.min(MAX_MINUTES, Math.floor(elapsedMs(state, now) / MINUTE));
    return { state: IDLE, session: minutes >= 1 ? sessionOf(state, minutes, now) : null };
  }
  if (state.phase !== "focus") return { state, session: null };
  const minutes = Math.floor((state.minutes * MINUTE - remainingMs(state, now)) / MINUTE);
  return { state: IDLE, session: minutes >= 1 ? sessionOf(state, minutes, now) : null };
}

// The next session now, or the end of the round when it was the long break.
export function skipBreak(state, now) {
  if (state.phase !== "break") return state;
  return state.long ? roundDone(state) : focusAt(state, now, state.round + 1);
}

// The answers to "Save it?" after an away session: { state, session } or the idle state.
export const keepAway = (state) => ({ state: IDLE, session: state.pending });
export const dropAway = () => IDLE;

// Called once a second while the timer runs. Returns { state, events }; events say what happened:
//   { type: "session", session }  a session finished: save it
//   { type: "break", long }       a break started
//   { type: "focus", round }      the next session started
//   { type: "roundDone" }         the long break is over and the cycle stopped
//   { type: "away", session }     a session ended unseen: ask before saving it
//   { type: "breakAway" }         a break ended unseen: the cycle stopped
//   { type: "watchFull", session }  the stopwatch reached 3 hours: it stopped, save it
//   { type: "watchAway" }          the stopwatch went unwatched with under a minute counted: it stopped
export function tick(state, now) {
  if (!isRunning(state)) return { state, events: [] };
  if (watching(state)) {
    // Asleep or closed for a while: never count that time without asking.
    if (unwatched(state, now)) return watchAway(state);
    if (now - state.since < MAX_MINUTES * MINUTE) return { state: { ...state, lastTick: now }, events: [] };
    const session = sessionOf(state, MAX_MINUTES, state.since + MAX_MINUTES * MINUTE);
    return { state: IDLE, events: [{ type: "session", session }, { type: "watchFull" }] };
  }
  if (now < state.endsAt) return { state: { ...state, lastTick: now }, events: [] };

  if (now - state.lastTick > AWAY_GAP) {
    if (state.phase === "break") return { state: IDLE, events: [{ type: "breakAway" }] };
    const pending = sessionOf(state, state.minutes, state.endsAt);
    return {
      state: { phase: "away", area: state.area, task: state.task, minutes: state.minutes, pending },
      events: [{ type: "away", session: pending }],
    };
  }

  // Each new phase starts when the last one should have ended, not when this tick came,
  // so a late tick never stretches the cycle.
  // With auto-start off, the break or the next session waits at its full length instead.
  if (state.phase === "focus") {
    const next = breakAt(state, state.endsAt);
    const waits = !optionsOf(state).autoBreak;
    return {
      state: waits ? held(next, now) : { ...next, lastTick: now },
      events: [{ type: "session", session: sessionOf(state, state.minutes, state.endsAt) },
        { type: "break", long: next.long, waiting: waits }],
    };
  }
  if (state.long) return { state: roundDone(state), events: [{ type: "roundDone" }] };
  const next = focusAt(state, state.endsAt, state.round + 1);
  const waits = !optionsOf(state).autoFocus;
  return { state: waits ? held(next, now) : { ...next, lastTick: now }, events: [{ type: "focus", round: next.round, waiting: waits }] };
}

// --- Saving between page loads ---

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isText = (v) => typeof v === "string" && v.length > 0;

// A state read back from storage, checked field by field. Anything odd gives the idle state.
export function fromSaved(raw) {
  if (!raw || typeof raw !== "object") return IDLE;
  const base = AREAS.includes(raw.area) && (isLength(raw.minutes) || (raw.phase === "watch" && raw.minutes === 0))
    && (raw.task === null || typeof raw.task === "string");
  if (!base) return IDLE;
  const { area, task, minutes } = raw;

  if (raw.phase === "watch") {
    const running = isNumber(raw.since) && raw.elapsed === null;
    const paused = raw.since === null && isNumber(raw.elapsed);
    if (!(isText(raw.date) && isNumber(raw.lastTick) && (running || paused))) return IDLE;
    return { phase: "watch", area, task, minutes: 0, date: raw.date, since: raw.since, elapsed: raw.elapsed, lastTick: raw.lastTick };
  }

  const opts = timerOptions(raw.opts);
  if (raw.phase === "done") return { phase: "done", area, task, minutes, opts };
  if (raw.phase === "away") {
    const p = raw.pending;
    const ok = p && typeof p === "object" && isText(p.date) && AREAS.includes(p.area) && isNumber(p.minutes)
      && (p.task === null || typeof p.task === "string") && isText(p.ended_at);
    return ok ? { phase: "away", area, task, minutes,
      pending: { date: p.date, area: p.area, task: p.task, minutes: p.minutes, ended_at: p.ended_at } } : IDLE;
  }
  if (!timed(raw)) return IDLE;

  const running = isNumber(raw.endsAt) && raw.remaining === null;
  const paused = raw.endsAt === null && isNumber(raw.remaining);
  const ok = Number.isInteger(raw.round) && raw.round >= 1 && raw.round <= opts.every
    && isText(raw.date) && isNumber(raw.lastTick) && (running || paused)
    && (raw.phase === "focus" || typeof raw.long === "boolean");
  if (!ok) return IDLE;
  const state = { phase: raw.phase, area, task, minutes, round: raw.round, date: raw.date,
    endsAt: raw.endsAt, remaining: raw.remaining, lastTick: raw.lastTick, opts,
    ...(paused && raw.waiting === true ? { waiting: true } : {}) };
  return raw.phase === "break" ? { ...state, long: raw.long } : state;
}

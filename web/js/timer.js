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
// While paused, endsAt is null and remaining holds the time that was left.
// round: which session of the round (1 to 4); date: the day the session started on.

export const LENGTHS = [15, 25, 50];
export const AREAS = ["study", "work"];
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
export const SESSIONS_A_ROUND = 4;
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

const timed = (state) => state.phase === "focus" || state.phase === "break";

export const isRunning = (state) => timed(state) && state.endsAt !== null;
export const isPaused = (state) => timed(state) && state.endsAt === null;

function phaseLength(state) {
  if (state.phase === "focus") return state.minutes * MINUTE;
  return (state.long ? LONG_BREAK : SHORT_BREAK) * MINUTE;
}

// How long the current session or break still has to run.
export function remainingMs(state, now) {
  if (!timed(state)) return 0;
  return state.endsAt === null ? state.remaining : Math.max(0, state.endsAt - now);
}

// The share of the session or break still to go: 1 at the start, 0 at the end (for the ring).
export function ringShare(state, now) {
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
  };
}

function breakAt(state, start) {
  const long = state.round >= SESSIONS_A_ROUND;
  return {
    phase: "break", area: state.area, task: state.task, minutes: state.minutes, round: state.round, long,
    date: state.date, endsAt: start + (long ? LONG_BREAK : SHORT_BREAK) * MINUTE, remaining: null, lastTick: start,
  };
}

const roundDone = (state) => ({ phase: "done", area: state.area, task: state.task, minutes: state.minutes });

// Starts session 1 of a round. task: the focus task's text, or null for none.
export function startSession({ area, task = null, minutes }, now) {
  return focusAt({ area, task: task || null, minutes }, now, 1);
}

export function pause(state, now) {
  if (!isRunning(state)) return state;
  return { ...state, endsAt: null, remaining: Math.max(0, state.endsAt - now), lastTick: now };
}

export function resume(state, now) {
  if (!isPaused(state)) return state;
  return { ...state, endsAt: now + state.remaining, remaining: null, lastTick: now };
}

// Reset throws the session away; Stop ends the cycle during a break. Neither saves anything.
export const reset = () => IDLE;
export const stopCycle = () => IDLE;

// Ends the session now and saves the whole minutes the clock ran. Under a minute saves nothing.
// Returns { state, session } (session is null when there is nothing to save).
export function finishEarly(state, now) {
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
export function tick(state, now) {
  if (!isRunning(state)) return { state, events: [] };
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
  if (state.phase === "focus") {
    const next = breakAt(state, state.endsAt);
    return {
      state: { ...next, lastTick: now },
      events: [{ type: "session", session: sessionOf(state, state.minutes, state.endsAt) },
        { type: "break", long: next.long }],
    };
  }
  if (state.long) return { state: roundDone(state), events: [{ type: "roundDone" }] };
  const next = focusAt(state, state.endsAt, state.round + 1);
  return { state: { ...next, lastTick: now }, events: [{ type: "focus", round: next.round }] };
}

// --- Saving between page loads ---

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isText = (v) => typeof v === "string" && v.length > 0;

// A state read back from storage, checked field by field. Anything odd gives the idle state.
export function fromSaved(raw) {
  if (!raw || typeof raw !== "object") return IDLE;
  const base = AREAS.includes(raw.area) && LENGTHS.includes(raw.minutes)
    && (raw.task === null || typeof raw.task === "string");
  if (!base) return IDLE;
  const { area, task, minutes } = raw;

  if (raw.phase === "done") return { phase: "done", area, task, minutes };
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
  const ok = Number.isInteger(raw.round) && raw.round >= 1 && raw.round <= SESSIONS_A_ROUND
    && isText(raw.date) && isNumber(raw.lastTick) && (running || paused)
    && (raw.phase === "focus" || typeof raw.long === "boolean");
  if (!ok) return IDLE;
  const state = { phase: raw.phase, area, task, minutes, round: raw.round, date: raw.date,
    endsAt: raw.endsAt, remaining: raw.remaining, lastTick: raw.lastTick };
  return raw.phase === "break" ? { ...state, long: raw.long } : state;
}

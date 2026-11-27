// Tests for timer.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  IDLE, startSession, pause, resume, reset, finishEarly, skipBreak, stopCycle, tick, keepAway, dropAway,
  remainingMs, ringShare, countdownText, fromSaved, startWatch, elapsedMs, countupText, readoutText,
  adjust, pause as pauseTimer, timerOptions, roundSize, isStrict, DEFAULT_OPTIONS, isPaused,
} from "../js/timer.js";

const MIN = 60_000;
// 19 Nov 2026, 14:00 on this computer's own clock.
const T0 = new Date(2026, 10, 19, 14, 0).getTime();
const at = (minutes) => T0 + minutes * MIN;

// Ticks once a second (as the page does) from one time to another; collects every event.
function run(state, from, to) {
  const events = [];
  for (let now = from; now <= to; now += 1000) {
    const result = tick(state, now);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const begin = (options = {}) => startSession({ area: "study", task: "Essay", minutes: 25, ...options }, T0);

test("start: a focus session with its end time", () => {
  const s = begin();
  assert.strictEqual(s.phase, "focus");
  assert.strictEqual(s.round, 1);
  assert.strictEqual(s.endsAt, at(25));
  assert.strictEqual(remainingMs(s, at(10)), 15 * MIN);
  assert.strictEqual(countdownText(remainingMs(s, at(10))), "15:00");
  assert.strictEqual(ringShare(s, at(10)), 0.6);
});

test("the end of a session saves it and starts a 5-minute break on its own", () => {
  const { state, events } = run(begin(), T0, at(25));
  assert.deepStrictEqual(events.map((e) => e.type), ["session", "break"]);
  assert.deepStrictEqual(events[0].session, {
    date: "2026-11-19", area: "study", task: "Essay", minutes: 25, ended_at: "14:25",
  });
  assert.strictEqual(state.phase, "break");
  assert.strictEqual(state.long, false);
  assert.strictEqual(state.endsAt, at(30));
});

test("after the break the next session starts on its own, same task and length", () => {
  const { state, events } = run(begin(), T0, at(30));
  assert.deepStrictEqual(events.map((e) => e.type), ["session", "break", "focus"]);
  assert.strictEqual(state.phase, "focus");
  assert.strictEqual(state.round, 2);
  assert.strictEqual(state.task, "Essay");
  assert.strictEqual(state.endsAt, at(55));
});

test("a full round: 4 sessions, a 15-minute break after the 4th, then the cycle stops", () => {
  // 4 x 25 min sessions, 3 x 5 min breaks, then the long break: 100 + 15 + 15 = 130 min.
  const { state, events } = run(begin(), T0, at(131));
  const saved = events.filter((e) => e.type === "session");
  assert.strictEqual(saved.length, 4);
  assert.deepStrictEqual(saved.map((e) => e.session.ended_at), ["14:25", "14:55", "15:25", "15:55"]);
  const breaks = events.filter((e) => e.type === "break");
  assert.deepStrictEqual(breaks.map((e) => e.long), [false, false, false, true]);
  assert.strictEqual(events.at(-1).type, "roundDone");
  assert.strictEqual(state.phase, "done");
  // Nothing more happens however long the page stays open.
  assert.deepStrictEqual(run(state, at(131), at(140)).events, []);
});

test("pause stops the clock; resume carries on from where it was", () => {
  let s = pause(begin(), at(10));
  assert.strictEqual(remainingMs(s, at(40)), 15 * MIN);
  assert.deepStrictEqual(run(s, at(10), at(40)).events, []);
  s = resume(s, at(40));
  assert.strictEqual(s.endsAt, at(55));
  const { events } = run(s, at(40), at(55));
  assert.strictEqual(events[0].session.minutes, 25);
  assert.strictEqual(events[0].session.ended_at, "14:55");
});

test("finish early saves the whole minutes done and stops the cycle", () => {
  const { state, session } = finishEarly(begin(), at(18) + 40_000);
  assert.strictEqual(state.phase, "idle");
  assert.deepStrictEqual(session, { date: "2026-11-19", area: "study", task: "Essay", minutes: 18, ended_at: "14:18" });
});

test("finish early counts only the time the clock ran", () => {
  let s = pause(begin(), at(5));
  s = resume(s, at(30));
  assert.strictEqual(finishEarly(s, at(32)).session.minutes, 7);
});

test("finish early in the first minute saves nothing", () => {
  assert.strictEqual(finishEarly(begin(), T0 + 50_000).session, null);
});

test("reset throws the session away", () => {
  assert.deepStrictEqual(reset(begin()), IDLE);
});

test("a break can be skipped (next session now) or stopped", () => {
  const { state } = run(begin(), T0, at(26));
  const next = skipBreak(state, at(26));
  assert.strictEqual(next.phase, "focus");
  assert.strictEqual(next.round, 2);
  assert.strictEqual(next.endsAt, at(51));
  assert.deepStrictEqual(stopCycle(state), IDLE);
});

test("skipping the long break ends the round", () => {
  const { state } = run(begin({ minutes: 15 }), T0, at(4 * 15 + 3 * 5 + 1));
  assert.strictEqual(state.long, true);
  assert.strictEqual(skipBreak(state, at(76)).phase, "done");
});

test("away: a session that ended while the page couldn't watch is not saved without asking", () => {
  const s = tick(begin(), at(1)).state;
  // The laptop slept from 14:01 to 16:00.
  const { state, events } = tick(s, at(120));
  assert.deepStrictEqual(events.map((e) => e.type), ["away"]);
  assert.strictEqual(state.phase, "away");
  assert.deepStrictEqual(state.pending, { date: "2026-11-19", area: "study", task: "Essay", minutes: 25, ended_at: "14:25" });
  assert.deepStrictEqual(run(state, at(120), at(130)).events, []);
  const kept = keepAway(state);
  assert.deepStrictEqual(kept.session, state.pending);
  assert.deepStrictEqual(kept.state, IDLE);
  assert.deepStrictEqual(dropAway(state), IDLE);
});

test("away during a break: the cycle stops instead of starting a session nobody is there for", () => {
  const { state } = run(begin(), T0, at(26));
  const { state: after, events } = tick(state, at(90));
  assert.deepStrictEqual(events.map((e) => e.type), ["breakAway"]);
  assert.deepStrictEqual(after, IDLE);
});

test("a gap that ends before the session does changes nothing", () => {
  const s = tick(begin(), at(1)).state;
  const { state, events } = tick(s, at(10));
  assert.deepStrictEqual(events, []);
  assert.strictEqual(state.phase, "focus");
});

test("a session keeps the date it started on, even past midnight", () => {
  const late = startSession({ area: "work", task: null, minutes: 50 }, new Date(2026, 10, 19, 23, 40).getTime());
  const end = new Date(2026, 10, 20, 0, 30).getTime();
  const { events } = run(late, end - 2000, end);
  assert.deepStrictEqual(events[0].session, { date: "2026-11-19", area: "work", task: null, minutes: 50, ended_at: "00:30" });
});

test("fromSaved: a good saved state comes back; junk becomes idle", () => {
  const s = begin();
  assert.deepStrictEqual(fromSaved(JSON.parse(JSON.stringify(s))), s);
  for (const junk of [null, 5, "x", {}, { phase: "focus" }, { ...s, minutes: 181 }, { ...s, minutes: 0 }, { ...s, area: "sleep" }, { ...s, endsAt: "soon" }]) {
    assert.deepStrictEqual(fromSaved(junk), IDLE, JSON.stringify(junk));
  }
});

test("countdownText", () => {
  assert.strictEqual(countdownText(25 * MIN), "25:00");
  assert.strictEqual(countdownText(61_000), "1:01");
  assert.strictEqual(countdownText(500), "0:01");
  assert.strictEqual(countdownText(0), "0:00");
  assert.strictEqual(countdownText(-5), "0:00");
});

test("a custom length is kept when saved", () => {
  const s = startSession({ area: "study", minutes: 40 }, T0);
  assert.strictEqual(remainingMs(s, at(10)), 30 * MIN);
  assert.deepStrictEqual(fromSaved(JSON.parse(JSON.stringify(s))), s);
});

test("stopwatch: counts up, pauses, and Stop saves the whole minutes", () => {
  let w = startWatch({ area: "work", task: "Site" }, T0);
  assert.strictEqual(readoutText(w, at(12) + 4000), "12:04");
  w = pause(w, at(20));
  assert.strictEqual(elapsedMs(w, at(50)), 20 * MIN);
  w = resume(w, at(50));
  assert.strictEqual(elapsedMs(w, at(55) + 30_000), 25 * MIN + 30_000);
  assert.deepStrictEqual(fromSaved(JSON.parse(JSON.stringify(w))), w);
  w = run(w, at(50) + 1000, at(55) + 30_000).state; // the page ticks every second while it runs
  const { state, session } = finishEarly(w, at(55) + 30_000);
  assert.deepStrictEqual(state, IDLE);
  assert.deepStrictEqual(session, { date: "2026-11-19", area: "work", task: "Site", minutes: 25, ended_at: "14:55" });
  assert.strictEqual(finishEarly(startWatch({ area: "work" }, T0), at(0.5)).session, null);
});

test("stopwatch stops by itself at 3 hours and saves 180 minutes", () => {
  const { state, events } = run(startWatch({ area: "study" }, T0), T0 + 1000, at(180) + 1000);
  assert.deepStrictEqual(state, IDLE);
  assert.strictEqual(events[0].session.minutes, 180);
  assert.strictEqual(events[1].type, "watchFull");
});

test("countupText", () => {
  assert.strictEqual(countupText(0), "0:00");
  assert.strictEqual(countupText(61_000), "1:01");
  assert.strictEqual(countupText(62 * MIN + 9000), "1:02:09");
});


test("stopwatch: a long unwatched gap is never counted without asking", () => {
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  let s = startWatch({ area: "study" }, t0);
  // Watched for 20 minutes, ticking each second.
  for (let ms = 1000; ms <= 20 * 60_000; ms += 1000) s = tick(s, t0 + ms).state;
  const { state, events } = tick(s, t0 + 5 * 60 * 60_000); // the laptop slept for hours
  assert.equal(state.phase, "away");
  assert.equal(state.pending.minutes, 20);         // only the watched minutes, up to the last tick
  assert.equal(state.pending.ended_at, "09:20");
  assert.deepEqual(events.map((e) => e.type), ["away"]);
});

test("stopwatch: Stop after an unwatched gap asks instead of saving", () => {
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  let s = startWatch({ area: "work" }, t0);
  for (let ms = 1000; ms <= 10 * 60_000; ms += 1000) s = tick(s, t0 + ms).state;
  const { state, session } = finishEarly(s, t0 + 2 * 60 * 60_000);
  assert.equal(session, null);
  assert.equal(state.phase, "away");
  assert.equal(state.pending.minutes, 10);
});

test("stopwatch: an unwatched gap with under a minute counted just stops", () => {
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  const s = startWatch({ area: "study" }, t0);
  const { state, events } = tick(s, t0 + 60 * 60_000);
  assert.equal(state.phase, "idle");
  assert.deepEqual(events.map((e) => e.type), ["watchAway"]);
});

test("stopwatch: normal ticking still saves by itself at 3 hours", () => {
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  let s = startWatch({ area: "study" }, t0);
  let last = { state: s, events: [] };
  for (let ms = 1000; ms <= 3 * 60 * 60_000 && last.state.phase === "watch"; ms += 1000) last = tick(last.state, t0 + ms);
  assert.deepEqual(last.events.map((e) => e.type), ["session", "watchFull"]);
  assert.equal(last.events[0].session.minutes, 180);
});


test("+ / − changes a running or paused focus session by 5 minutes, within its limits", () => {
  const t0 = new Date(2026, 10, 22, 9, 0).getTime();
  const s = startSession({ area: "study", minutes: 25 }, t0);
  const longer = adjust(s, 5, t0 + 60_000);
  assert.equal(longer.minutes, 30);
  assert.equal(remainingMs(longer, t0 + 60_000), 29 * 60_000);
  // Never shorter than what has run: 10 min in, a 25-minute session can go down to 11.
  assert.equal(adjust(s, -20, t0 + 10 * 60_000).minutes, 11);
  assert.equal(adjust(startSession({ area: "study", minutes: 178 }, t0), 5, t0).minutes, 180);
  const paused = pauseTimer(s, t0 + 60_000);
  assert.equal(remainingMs(adjust(paused, 5, t0 + 120_000), t0 + 120_000), 29 * 60_000);
  const watch = startWatch({ area: "work" }, t0);
  assert.strictEqual(adjust(watch, 5, t0), watch);
  const one = startSession({ area: "study", minutes: 1 }, t0);
  assert.strictEqual(adjust(one, -5, t0), one); // already the shortest: unchanged
});

// --- the round's options (TickTick's Pomo settings) ---

test("timer options come from the settings' focus prefs, with defaults for anything off", () => {
  assert.deepStrictEqual(timerOptions(undefined), DEFAULT_OPTIONS);
  assert.deepStrictEqual(
    timerOptions({ short_break: 10, long_break: 30, long_break_every: 3, auto_break: false, auto_focus: false, strict: true }),
    { shortBreak: 10, longBreak: 30, every: 3, autoBreak: false, autoFocus: false, strict: true });
  assert.deepStrictEqual(timerOptions({ short_break: 0, long_break: 61, long_break_every: 9, strict: "yes" }), DEFAULT_OPTIONS);
});

test("custom breaks and a long break every 2 sessions end the round sooner", () => {
  const options = { short_break: 10, long_break: 20, long_break_every: 2 };
  const s = begin({ options });
  assert.strictEqual(roundSize(s), 2);
  let { state } = run(s, T0, at(25));
  assert.strictEqual(state.phase, "break");
  assert.strictEqual(state.long, false);
  assert.strictEqual(state.endsAt, at(35)); // a 10-minute break
  ({ state } = run(state, at(25) + 1000, at(60)));
  assert.strictEqual(state.phase, "break");
  assert.strictEqual(state.long, true);
  assert.strictEqual(state.endsAt, at(80)); // the 20-minute long break after session 2
  ({ state } = run(state, at(60) + 1000, at(80)));
  assert.strictEqual(state.phase, "done");
});

test("with auto-start off the break waits at full length, then the next session waits too", () => {
  const s = begin({ options: { auto_break: false, auto_focus: false } });
  const first = run(s, T0, at(30));
  assert.deepStrictEqual(first.events.map((e) => e.type), ["session", "break"]);
  assert.strictEqual(first.events[1].waiting, true);
  assert.ok(isPaused(first.state) && first.state.waiting);
  assert.strictEqual(remainingMs(first.state, at(30)), 5 * MIN);
  const started = resume(first.state, at(40));
  assert.strictEqual(started.waiting, undefined);
  assert.strictEqual(started.endsAt, at(45));
  const second = run(started, at(40) + 1000, at(46));
  assert.strictEqual(second.state.phase, "focus");
  assert.ok(second.state.waiting && second.state.remaining === 25 * MIN);
});

test("a session that waited for a press is saved on the day it starts", () => {
  const late = startSession({ area: "study", minutes: 25, options: { auto_break: true, auto_focus: false } },
    new Date(2026, 10, 19, 23, 20).getTime());
  const waiting = run(late, late.lastTick, late.lastTick + 31 * MIN).state;
  assert.ok(waiting.waiting);
  const nextDay = new Date(2026, 10, 20, 8, 0).getTime();
  assert.strictEqual(resume(waiting, nextDay).date, "2026-11-20");
});

test("strict mode applies to a running focus session only", () => {
  const s = begin({ options: { strict: true } });
  assert.ok(isStrict(s));
  assert.ok(!isStrict(run(s, T0, at(25)).state));
  assert.ok(!isStrict(begin()));
});

test("the options and a waiting state survive a reload; an old save without options gets the defaults", () => {
  const s = begin({ options: { long_break_every: 3, auto_break: false } });
  const waiting = run(s, T0, at(25)).state;
  const back = fromSaved(JSON.parse(JSON.stringify(waiting)));
  assert.deepStrictEqual(back, waiting);
  const { opts, ...old } = begin();
  assert.deepStrictEqual(fromSaved(old).opts, DEFAULT_OPTIONS);
  assert.strictEqual(fromSaved({ ...JSON.parse(JSON.stringify(s)), round: 4 }), IDLE); // past a round of 3
});

test("sleep stamps: a bedtime from noon goes on tomorrow, before noon on today", async () => {
  const { sleepStamp } = await import("../js/timer.js");
  const at = (day, h, m) => new Date(2026, 10, day, h, m).getTime();
  assert.deepStrictEqual(sleepStamp("bedtime", at(27, 23, 10)),
    { date: "2026-11-28", field: "bedtime", time: "23:10", tomorrow: true });
  assert.deepStrictEqual(sleepStamp("bedtime", at(28, 0, 40)),
    { date: "2026-11-28", field: "bedtime", time: "00:40", tomorrow: false });
  assert.strictEqual(sleepStamp("bedtime", at(27, 12, 0)).date, "2026-11-28");
  assert.strictEqual(sleepStamp("bedtime", at(27, 11, 59)).date, "2026-11-27");
  // The last day of a month and of a year roll over.
  assert.strictEqual(sleepStamp("bedtime", at(30, 22, 0)).date, "2026-12-01");
  assert.strictEqual(sleepStamp("bedtime", new Date(2026, 11, 31, 22, 0).getTime()).date, "2027-01-01");
});

test("sleep stamps: a wake-up always goes on today", async () => {
  const { sleepStamp } = await import("../js/timer.js");
  assert.deepStrictEqual(sleepStamp("wake_time", new Date(2026, 10, 28, 7, 5).getTime()),
    { date: "2026-11-28", field: "wake_time", time: "07:05", tomorrow: false });
  assert.strictEqual(sleepStamp("wake_time", new Date(2026, 10, 28, 13, 30).getTime()).date, "2026-11-28");
});

// Tests for timer.js, run with: node --test web/tests/
import test from "node:test";
import assert from "node:assert";
import {
  IDLE, startSession, pause, resume, reset, finishEarly, skipBreak, stopCycle, tick, keepAway, dropAway,
  remainingMs, ringShare, countdownText, fromSaved,
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
  for (const junk of [null, 5, "x", {}, { phase: "focus" }, { ...s, minutes: 30 }, { ...s, area: "sleep" }, { ...s, endsAt: "soon" }]) {
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

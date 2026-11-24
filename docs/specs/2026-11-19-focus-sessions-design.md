# Focus sessions and a pomodoro timer: design

2026-11-19. v2 stage 1 in `FEATURES.md`. Laptop-only: the online plan (`2026-11-17-compass-online-design.md`) is on hold.

## Why
Compass is replacing TickTick bit by bit, and TickTick's focus timer is the part used daily. Time spent in a focus session is real study or work, so it should count toward the Study and Work scores without typing it in again.

## Done when
- The Study and Work pages have a timer: 15, 25 or 50 minutes, one of today's focus tasks (or none), a ring countdown.
- It runs a pomodoro cycle on its own: session, 5-min break, session, ... and a 15-min break after the 4th session, then stops with "Round done".
- A finished session is saved on its day and its minutes add to that day's Study or Work hours everywhere (scores, bars, history, brief, Insights).
- "Finish early" saves the minutes done; "Reset" saves nothing. A session can be removed afterwards.
- Under the log form: "1 h logged + 2 sessions (50 min) = 1 h 50 min".
- Home shows today's focus summary (and a running timer); the Insights weekly review has a focus line.
- A browser notification at each phase change.

**Not in this round:** stages 2 and 3 (natural-language dates, steps under goals, per-goal totals, reminders), phone layouts beyond today's 360 px rules, syncing a running timer between devices.
**Must never happen:** hours counted for time the user wasn't there; a session lost because another save overwrote the day; a session ticking a focus task; manual and session hours merged so they can't be told apart.

## Decisions
**The user's (2026-11-18 and 2026-11-19):** sessions live on the Day (no new table, no schema bump); 15, 25, 50 minutes; picker of today's tasks; a session never ticks a task; the timer lives on the Study and Work pages and Home is a summary; stage 1 only; two buttons for stopping early (Finish early saves, Reset discards); a full pomodoro cycle that runs on its own.

**Claude's calls (change them freely):**
- Breaks: 5 minutes, and 15 minutes after every 4th session. Break time is never logged.
- The cycle stops after the long break ("Round done: 4 sessions"), so a tab left open can't keep adding hours. Starting another round is one click.
- Away guard: if a session's end passed while the page couldn't watch it (laptop asleep, tab closed, a gap of over 3 minutes between ticks; not less, because Chrome slows a background tab's timers to once a minute), the cycle stops and asks "Save it?" with Save session and Discard session. Nothing is saved without that. The tick comes from a small worker (`web/js/ticker.js`), which keeps ticking once a second in a background tab.
- Finish early saves the whole minutes done, at least 1, and stops the cycle. Reset saves nothing and stops the cycle.
- A session belongs to the date it started, even if it ends after midnight.
- One timer for Study and Work together. While one runs, the other page and Home show "Study session running · 12:04 left" instead of a second timer.
- The next session in a cycle keeps the same task. The session stores the task's text, not its position, since tasks can be edited.
- Notification permission is asked on the first Start. If notifications are denied or missing, the same words go to a polite live region on the page, and the tab title shows the time left.
- The running timer is kept in `localStorage` (end times, not a countdown), so a reload keeps it. If storage is blocked, the timer still works until a reload.

## Approaches (how session time reaches the scores)
1. **Add session minutes when the dashboard and Insights read days (chosen).** One helper hands those routes days whose `study_hours` and `work_hours` include sessions; every existing rule then counts them with no change. Stored manual hours stay separate, so the log form and the breakdown still know what was typed.
2. Write the totals into `study_hours` on save: simple, but manual and session time merge for good and Remove can't undo cleanly.
3. A `hours(day, field)` helper at every rule (about 10 places): one missed place gives a quietly wrong number.

## Design
**Data.** A Day gains `sessions: [{id, area, task, minutes, ended_at}]`: area `study` or `work`; task text up to 200 characters or null; minutes a whole number from 1 to 180; ended_at `HH:MM`. Junk is dropped, at most 48 a day. Older days and backups load with none.

**Rules (`server/app/focus.py`).** `with_focus_hours(days)`: logged hours plus session minutes / 60, capped at 24; a day with neither stays a gap. `focus_summary(days, today)`: today's and the week's sessions and minutes, per area. `focus_review_line(week, before)` for the Insights extras.

**API.** `POST /api/days/{date}/sessions` (server makes the id) and `DELETE /api/days/{date}/sessions/{id}`, both returning the day. `PUT /api/days/{date}` keeps the stored sessions and ignores any in the body, so a stale save (a note autosave from an older page) can't wipe a new session. Dashboard and Insights read days through `with_focus_hours`; the dashboard also returns `focus`.

**Page.** `web/js/timer.js` holds the timer logic with no page access, so it is tested with a fake clock. `render.js` draws the panel, the session list, the breakdown and the Home summary. `app.js` ticks once a second while running, updating only the ring, the time and the tab title, so focus and typed text are never disturbed.

## Left to the builder
Markup and styles (current dark look), the exact notification wording, test layout. Existing tests keep passing.

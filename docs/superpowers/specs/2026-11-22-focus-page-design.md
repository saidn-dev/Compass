# Focus page design (2026-11-22)

## Why

Compass is replacing TickTick bit by bit. The focus timer is the part used every day, but it currently lives only on the Study and Work pages, with a one-line summary on Home. There is no single place to start a session for either module and no cross-day view of focus time. The user wants a TickTick-style Focus page tied to the same timer.

## Goals

- One Focus page starts and controls the shared Study/Work timer; a session started there shows as running on the module page and Home.
- The page shows today and this week, a 14-day session log, time per task/goal, and a separate Charts tab.
- Sessions stay Study or Work only, stored exactly as they are now. No schema change, no new table, no change to the POST/DELETE session routes.
- Keyboard, screen-reader and 360 px behaviour match the rest of Compass.

## Non-goals

- No non-focus modules, no AI, no cross-device sync, and no new session fields.
- Home remains a summary, not a second full timer.
- Empty days in the focus charts are a real zero (a session either happened or it did not); the "blank is a gap" rule is for logged numbers, not session counts.

## User decisions (2026-11-22)

- The timer shows on the Focus page and on Study/Work. It is one timer in `web/js/timer.js`, persisted under `compass.timer`, so it is running everywhere at once.
- The page has Today and Charts tabs. Today holds the timer, today/this-week totals, the session log and time per task/goal. Charts hold focus minutes over 7 days and 12 weeks.
- Only Study and Work sessions exist, and only when those modules are switched on.
- Claude builds it.

## Approaches considered

1. **A dedicated `/api/focus` payload plus dedicated renderers (chosen).** The server already owns session rules and already has the 12-week day window. One new endpoint returns exactly what the page needs; the page renders it with the existing chart and timer parts. Costs one request per page load and one small API surface.
2. **Reuse the dashboard payload and compute the rest in the browser.** No new endpoint, but the dashboard has no 14-day log, per-task totals or week buckets, so the browser would take over server rules and make the page depend on several endpoints. Rejected.
3. **Call `/api/days` for every day and aggregate client-side.** Same problem, multiplied by requests. Rejected.

## Design

### Server

`GET /api/focus?date=YYYY-MM-DD` mirrors the insights route: it reads 12 weeks with `repo.days_between(first, today)` and returns `focus_page(days, settings, today)` from `server/app/focus.py`, reusing `_minutes`, `duration_text`, `last_n_dates` and the history week labels from `insights.build_history` (`_short_date`).

`focus_page()` returns:

- `summary`: `focus_summary(days, today)` plus this week's minutes per area.
- `log`: sessions from the last 14 days, newest day first, empty days omitted: `{date, minutes, sessions: [{id, area, task, minutes, ended_at}]}`.
- `tasks`: `{area, task, minutes, count, goal}` for the last 7 days and the 12 weeks, sorted by minutes descending; `task: null` renders as "No task"; a Study task whose name matches a `settings.study_goals` name is flagged with the same equality rule as `goal_sessions` in `server/app/study.py`.
- `days`: 7 items `{date, study, work}` in minutes; `weeks`: 12 items `{label, study, work}`, oldest first, with labels from the dashboard history helper.
- Only modules in `settings.modules ∩ {study, work}` contribute.

No new storage. Sessions are still written and removed by the existing day-session routes.

### Page

- `pageFromHash` accepts `focus` only when Study or Work is on; otherwise Home. The nav gets a Focus link after the modules. The 360 px bottom bar is checked for all seven links.
- `#focus-view` is a normal view with its own `body[data-page="focus"]` glow (#3f3040, between Study and Work).
- WAI-ARIA tabs: Today (default) and Charts, with arrow keys, `aria-selected`, and the chosen tab remembered in localStorage with try/catch.
- Today: timer panel with a Study/Work radio switch (only enabled modules; running area, then last used, then Study), today/week totals split by area, a session log grouped by day with Remove, and per-task rows with a 7-days / 12-weeks toggle.
- Charts: `barChart` gains an optional second value so Study and Work can stack in one bar; screen-reader text names both series. Values are shown in hours.

### Timer linking

`renderFocusPanel` gets its area from the running timer when busy and from the radio switch when idle. `focusStartForm` accepts an optional area picker: the checked radio supplies `data-area` at submit time, and changing it redraws only the task picker (Study goals appear for Study). One `bindTimerEvents(view)` serves the module view and the Focus view. `redrawFocus()` updates the Focus timer holder in place; `refreshAfterSessions()` refetches `/api/focus` and redraws totals, log and tasks without replacing the timer while someone is typing. Remove on the Focus page can delete any date in the log.

In this worktree the same panel also carries the Timer / Stopwatch tabs added in redesign round 2; the Focus page uses the same panel unchanged, so both modes work there.

## Builder calls (made during this build)

- The bad-date response is 422, matching the real `/api/insights` route, because the spec's "400" conflicts with its "same as /insights" instruction.
- The Focus glow is #3f3040, as proposed in the spec; contrast is checked in the browser.
- Tab and task-range choices use localStorage keys `compass.focus.tab` and `compass.focus.taskRange`, with try/catch like the timer.
- Stacking is added as an optional second series in `barChart` rather than a new chart renderer.

## Done when

- Unit tests cover `focus_page`, `/api/focus`, routing, nav, renderers, charts and the area picker.
- Both full suites pass (worktree baseline before this work: 595 pytest, 120 JS).
- Playwright checks the shared timer across Focus/Study/Work and Home, early finish, older-session remove, keyboard tabs, and 360 px / 1280 px screens; the console has no errors beyond the known favicon 404.
- Docs, memory and hand-back are updated; no commits.

## Earlier decision changed

The 2026-11-18 decision "the timer lives on the Study and Work pages, not Home" now reads: the Focus page is a third home for the timer. Home stays a summary, and its timer line links to `#/focus`.

# Compass v1 Features

Each feature lists what it needs first. Build top to bottom: a feature starts once everything under "Needs" is done. Details live in `2026-10-21-compass-v1-sdp.md`.

## Stage 1: Foundation
| Feature | Needs |
|---|---|
| Server runs and answers `/health` | nothing |
| Request protection (blocks other websites from the local API) | Server runs |
| Life areas and status rules (On track / Behind / No data) | nothing |
| Day entry cleaning (blank = gap, never 0) | Life areas |
| Database (save and load days and settings) | Day entry cleaning |

## Stage 2: Core logic
| Feature | Needs |
|---|---|
| Onboarding (pick up to 5 modules, default targets) | Life areas, Database |
| Focus tasks (max 3 a day) | Day entry cleaning |
| Habits and weekly completion | Day entry cleaning |
| Goals (max 3) | Database |
| Daily brief (3-4 sentences plus the numbers used) | Life areas, Onboarding, Database |

## Stage 3: API
| Feature | Needs |
|---|---|
| REST API (settings, days, dashboard) | Request protection, Database, Onboarding, Daily brief, Focus tasks, Habits, Goals |
| Export, import and delete-everything | REST API |

## Stage 4: Web page
| Feature | Needs |
|---|---|
| Page shell, themes (light, dark, system), safe text display | nothing |
| Onboarding screen (4-7 steps, with Sleep, Study and Work pages) | REST API, Page shell |
| Dashboard: score chips, Compass score and brief | REST API, Page shell, Onboarding screen |
| Daily log (on each module's page since 2026-11-13) | Dashboard |
| Focus, habits and goals sections | Dashboard |
| Quick capture notes (autosave) | Dashboard |
| Settings screen (modules, habits, goals, export, import, delete) | Dashboard, Export/import/delete |
| Side nav and module pages (Sleep, Study, Work) | Dashboard, Settings screen |
| Scores, weekly bars and contributors | Side nav and module pages |
| Check-in on Home (mood, tags, rest day) | Dashboard |
| Rest days lower weekly targets | Check-in, Scores |
| Carry over yesterday's unfinished focus tasks | Focus tasks |
| 12 weeks of history and tonight's bedtime on module pages | Side nav and module pages |
| Insights page: weekly review, patterns, streaks | Check-in, Scores |

## Stage 5: Extras
| Feature | Needs |
|---|---|
| One-command launcher (`python start.py`) | Server runs |
| QA pass and README update | Everything above |

## Done when
All tests pass, the QA checklist is signed off, and the app starts with one command and only talks to `127.0.0.1`.

## Later (v2, not in v1)
TickTick and Google Calendar data, AI assistant. These build on the same server.
Stages 1, 1b and 2 are built; the rest is planned. Build top to bottom, same as above.

### v2 stage 1: Focus sessions (built 2026-11-19)
| Feature | Needs |
|---|---|
| Focus sessions saved on a Day (id, area, task, minutes, ended_at); no new table and no schema bump | Focus tasks, Day entry cleaning |
| Focus timer on the Study and Work pages: ring countdown, picker of today's tasks, 15/25/50 min, Start/Pause/Finish early/Reset; a pomodoro cycle (5-min breaks, a 15-min break after the 4th session, then it stops) | Focus sessions, Module pages |
| Session minutes add to Study and Work hours on top of manually logged hours | Focus sessions, Scores |
| Focus breakdown under the module log form, e.g. "1 h logged + 2 sessions (50 min) = 1 h 50 min" | Session minutes add to hours |
| Remove a focus session | Focus sessions |
| Focus summary on Home and a focus line in the Insights weekly review | Focus sessions, Dashboard, Insights |
| Browser notification at each session end and break end | Focus timer |

A finished session never ticks a focus task; checkboxes stay manual (decided 2026-11-18). The timer control lives on the Study and Work pages, not Home: Home is the summary.
 Decided 2026-11-19: "Finish early" saves the minutes done and "Reset" saves nothing; the cycle runs on its own and stops after the long break; a session that ended while Compass wasn't open is only saved if you say so. Design: `docs/specs/2026-11-19-focus-sessions-design.md`.

### v2 stage 2: Study page depth (built 2026-11-20)
| Feature | Needs |
|---|---|
| Natural-language goal dates ("in 12 days", "next Monday", "5 Dec") | Study goals, Module pages |
| Steps under each study goal | Study goals |
| Per-goal session totals beside each goal | Focus sessions, Study goals |

Claude's calls (change them freely): dates are read in the browser (`web/js/dates.js`) and saved as YYYY-MM-DD, so the server and the brief are unchanged; the box shows what the date was read as while you type. "Monday" is the coming one and today counts; "next Monday" is never today; a day and month with no year is the next one to come. Steps are up to 10 a goal, typed one a line in the Study page's Edit form (onboarding stays short) and ticked on the page; a tick is kept when the step's text is unchanged. Session totals count the Study sessions whose task is the goal's name, over the 12 weeks the page loads, so renaming a goal starts its total again.

### v2 stage 2b: Focus page (built 2026-11-22)
| Feature | Needs |
|---|---|
| Focus page at `#/focus`, shown only when Study or Work is on; a Focus link in the nav, with all 7 links fitting at 360 px | Focus timer, Module pages |
| One shared timer on Focus and the module pages: Study/Work switch, Timer and Stopwatch modes, and the running area chosen by the timer | Focus timer |
| Today and this-week totals split by area and a 14-day session log with Remove on any day; the charts and time by task (7 days or 12 weeks, with a goal badge) live on Focus stats | Focus sessions, Study goals |
| `GET /api/focus?date=YYYY-MM-DD` returns the page payload; no new table and no schema bump | REST API, Focus sessions |
| From TickTick's Focus page (2026-11-22): **+ Add** a session that wasn't timed, and **Edit** a saved one's start, end and task (`PATCH /api/days/{date}/sessions/{id}`), which also covers "extra time" and "forgot to stop" | Focus sessions, REST API |
| From TickTick: **+ / − 5 min** beside the running time (never shorter than what has run, 1-180 min) | Focus timer |
| From TickTick: a full-width **Focus stats** page at `#/focus/stats` (the bar-chart icon beside ⋯ on Focus; it slides in from the right, and the Focus icon at its top left slides Focus back in from the left): totals for the last 7 days, this month, this year and the longest streak; a **Year** grid (53 weeks, months and weekdays marked); a 14-day **Focus timeline** on 24-hour tracks; **Most focused time** (minutes per hour over 12 weeks); the 7-day and 12-week bars; and time by task. The payload gains `year` and `hours` | Focus sessions |
| From TickTick's Statistics: Focus stats gains a **Day / Week / Month** switch with **‹ ›** arrows (remembered under `compass.focus.statsPeriod`): focus time, sessions, daily average (or longest session for a day), goal days, the bars (hours for a day, days otherwise), a **Focus split** ring by area and a task ranking. The payload gains `sessions` (53 weeks, or back to the first saved day) | Focus sessions |
| From TickTick: a **daily focus goal** (Settings → Focus, 0-720 min): a goal bar on the Focus rail, "Goal met" tiles and a longest goal streak on Focus stats | Focus sessions, Settings |
| From TickTick: a **note** on each session (500 characters): in the record dialog, shown in the Focus record, and offered with "Add a note" right after a timed session saves | Focus sessions, REST API |
| From TickTick: **estimated pomos** per task: − / + under the chosen task sets a plan (1-20, saved in `settings.focus.estimates`), and the task popover shows done/planned | Focus tasks, Settings |
| From TickTick: **timer options** in Settings → Focus: short and long break lengths, a long break after 2-8 sessions, auto-start the break and the next session (off: the timer waits at full length with Start break / Start session), and **strict mode** (no Pause, Finish or Reset while a session runs) | Focus timer, Settings |
| From TickTick: **Level and badges** on Focus stats: 13 levels by hours of focus and 9 badges (first session, 10 and 100 hours, 100 sessions, 7- and 30-day streaks, goal met 7 times, early start, late finish), computed from saved sessions | Focus sessions |
| From TickTick: a **Focus** button on Home's open tasks opens Focus with that task picked; the task popover's search can **add** a new task | Focus tasks, Focus timer |

Design: `docs/specs/2026-11-22-focus-page-design.md`. Sessions stay Study or Work only and are still written by the existing session routes. Home remains a summary, but its focus line now links to `#/focus`, so the 2026-11-18 decision that the timer does not live on Home is narrowed to: the timer lives on Focus and the module pages.

### v2 stage 3: Reminders and other pages
| Feature | Needs |
|---|---|
| Work stop-time reminder | Work profile, Session-end browser notification |
| Steps on the work goal | Work profile |
| Sleep wind-down countdown using tonight's bedtime | Bedtime guidance, Session-end browser notification |

### v2 stage 1b: Progress language (built 2026-11-19, from the Opal and Oura research)
Design: `docs/specs/2026-11-19-progress-language-design.md`.
| Feature | Needs |
|---|---|
| Bands 85/70/60 (Optimal, Good, Fair, Pay attention); Great / Ok / Too much for limits; On track / Behind removed | Scores, weekly bars and contributors |
| Top reason next to the gauge ("Mostly hours: 4 of 10 h this week") | Scores, weekly bars and contributors |
| Tone setting (Supportive or Direct) for the brief: what happened, an offer, a gentle limit | Daily brief, Settings screen |
| Learning your rhythm (first 14 days), last 14 days against your usual range, usual range shaded on the 12-week chart | Scores, 12 weeks of history |
| Graded streaks (lit, flicker, fade, revive) and holiday or exam pauses | Insights page |
| Weekly Focus Report, unlocked after 7 days, with time reclaimed | Focus sessions, Insights page |
| Hours on a study goal, goal pace line, study goals in the timer's task picker | Focus timer, Study goals |
| Onboarding: starting point with a projection, first focus session as the last step | Onboarding screen, Focus timer |

### Not in scope (decided 2026-11-18)
- Kanban, calendar and Eisenhower views: Compass shows one honest sentence, not five charts.
- Cross-device sync and collaboration: the server is local and single-user by design.
- Priority, recurring tasks and subtasks on Home: Home is a summary; task depth belongs on module pages.
- Auto-ticking focus tasks when a session ends: sessions only log time.

## Later (v3)
Points, levels and avatars (decided 2026-11-13).

Movement (steps) and the Java CSV importer were taken out of v1 on 2026-11-08. Steps need a step counter or another app, so both come back in v2 with the app connections. The importer code stays in `tools/importer/`.

# QA checklist

Manual checks to run before calling v1 done. Start the app with `python start.py`.

`[x]` = checked; the brackets at the end of each line say how. `[ ]` = still needs a person.

| In brackets | Checked on |
|---|---|
| browser script, curl, netstat, computed, screenshot, render tests, ran it | 2026-10-27 (first QA pass), 2026-10-29 (onboarding and Sleep lines), 2026-11-04 (Study lines) |
| by hand | 2026-10-28 |
| checked by Claude in the browser | the date on the line (2026-11-07 to 2026-11-10) |

## 1. Daily use

- [x] First visit shows onboarding; starting with 0 modules shows the server's message (browser script)
- [x] Onboarding with 3 modules shows 3 area cards and only those 3 log fields (browser script) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] Onboarding: a fresh start shows Welcome, then 5 steps labelled "Step 1 of 5" to "Step 5 of 5"; picking Sleep and another area makes it 6 (browser script) — superseded 2026-11-09: the onboarding Targets step was removed
- [x] Onboarding: a fresh start shows "Step 1 of 4" to "Step 4 of 4" (Welcome, Areas, Habits, Goals); each of Sleep, Study and Work adds one step (checked by Claude in the browser, 2026-11-10)
- [x] Onboarding targets: 0 is rejected with a message; a changed target shows on the dashboard card; the sleep target is kept (browser script) — superseded 2026-11-09: the onboarding Targets step was removed
- [x] Onboarding habits: habits added in the Habits step show in the dashboard habit grid; Remove works; Skip leaves none (browser script)
- [x] Onboarding goals: goals typed in are saved; blank rows are ignored; "Skip for now" finishes with no goals (browser script)
- [x] Onboarding resume: reload on the Targets step: starts at Welcome, areas, Sleep schedule and targets still filled in (browser script) — superseded 2026-11-09: the onboarding Targets step was removed
- [x] Onboarding Back works on every step and keeps saved choices (browser script)
- [x] Onboarding focus lands on each new step heading, and every field has a label (browser script)
- [ ] Onboarding with Narrator: each step heading is read when it appears, the Sleep radio group, time inputs and suggestion are read sensibly
- [ ] Narrator: Study step (row labels "Goal N" and "Date for goal N", Add and Remove, focus after each)
- [x] After onboarding, Settings > Modules still works and does not send you back to onboarding (browser script)
- [x] Settings > Study (2026-11-07): shown only with Study on; add a goal, Save study, goals and hours saved, no console errors (checked by Claude in the browser) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Sleep page, goal: the hours are saved as the sleep target and shown on the card (browser script)
- [x] Sleep page, schedule: the panel switches, "= 8 h a night" updates as you type, the schedule is saved and sets the target (browser script)
- [x] Sleep page, "Let's work it out": all answered gives a schedule with a tip; all skipped gives an 8 h goal; a shift worker gets no times and a note; Next before a suggestion shows a message (browser script)
- [x] Only Sleep picked: no Targets step; Sleep not picked: no Sleep step (browser script) — superseded 2026-11-09: the onboarding Targets step was removed
- [x] Daily log: schedule users log bed and wake times and the card shows the hours; goal users log hours; after switching to a goal, typed hours win (browser script) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] Brief: with a schedule and 4+ logged bedtimes, "In bed after ... on X of Y nights" shows, with its numbers under "Numbers used" (browser script)
- [x] Settings: Sleep switches between goal and schedule; other targets are kept; target labels point at the Settings inputs (browser script) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Study page: Study alone is "Step 3 of 5" with no Targets step; Sleep + Study + another area is 7 steps and Targets shows only the other area (browser script) — superseded 2026-11-09: the onboarding Targets step was removed
- [x] Study page: "+ Add another" up to 5 rows, then "Up to 5 goals."; Remove works; focus moves to the new row or to Add; typed text is kept (browser script)
- [x] Study page: the four messages (no goal named, a date with no name, a half-typed date, hours outside 0-168) (browser script)
- [x] Study page: goals, blank dates (saved as no date) and hours are saved; a saved "Stay under" rule is kept; Back and resume redraw the saved goals (browser script)
- [x] Study card: "in 12 days", "today", "tomorrow", "date passed" (up to 7 days), no line after 8 days, name only for an undated goal; the card's label reads the same (browser script) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] Brief: with Study furthest behind and a dated goal, "Exam is in 12 days." shows, with its date under "Numbers used" (browser script)
- [x] Study on with no goals: the dashboard loads and Settings > Save targets works; Save targets and unticking Study keep saved goals (browser script) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Work screens: Work alone is "Step 3 of 5" with "Work · 1 of 6" to "Work · 6 of 6"; Sleep + Study + Work is "Step 3 of 7" to "Step 5 of 7" with no Targets step (checked by Claude in the browser, 2026-11-09)
- [x] Work screen 3: the four messages (pick a day, enter start and end, start and end can't be the same, hours a week 0 to 168); "It varies" swaps the schedule for one hours box; "= N h a week" updates as you type (checked by Claude in the browser, 2026-11-09)
- [x] Work screens: Back through all six and from Habits to screen 6; reload redraws days, times, "It varies", focus and goal; a blank derailer list is saved as none (checked by Claude in the browser, 2026-11-09)
- [x] Work screens: Skip on all six gives 16 h, more is better (checked by Claude in the browser, 2026-11-09)
- [x] Work target: employed + Mon-Fri 09:00-17:00 shows "Limit 40 h"; freelance shows "Target 40 h"; "It varies" with 25 saves 25 and clears the schedule (checked by Claude in the browser, 2026-11-09)
- [x] Settings > Work: shown only with Work on; Save work changes the card's target and direction and leaves Sleep and Study settings alone; Settings > Targets still saves Sleep's goal or schedule and is hidden without Sleep (checked by Claude in the browser, 2026-11-09) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Log form: the Work field reads "Job search" for a job hunter, "Paid work" otherwise (checked by Claude in the browser, 2026-11-09) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] Settings > Work at 360 px: no sideways scrolling (checked by Claude in the browser, 2026-11-09) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Work onboarding and Settings: console shows only the favicon 404; every request goes to 127.0.0.1 (checked by Claude in the browser, 2026-11-09)
- [x] Onboarding Work screens at 360 px: no sideways scrolling (checked by Claude in the browser, 2026-11-10)
- [ ] Narrator: Work screens (headings, day buttons, It varies, focus)
- [x] Settings > Work saves a role with no schedule and "It varies" unticked (no error, "Saved"); a day button click clears "Saved" (checked by Claude in the browser, 2026-11-10) — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Onboarding: employed, Skip on the schedule screen, finish: the Work card says "Limit 40 h" (checked by Claude in the browser, 2026-11-10) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] Menu: Home, the modules that are on, Settings; turning a module on or off in Settings changes the menu at once; the page showing is marked as current (checked by Claude in the browser, 2026-11-12)
- [x] Addresses: `#/sleep`, `#/work`, `#/settings` open their pages; reload stays on the page; Back and Forward work; `#/study` with Study off and `#/nonsense` go Home (checked by Claude in the browser, 2026-11-12)
- [x] Menu hidden through onboarding (an address typed during onboarding changes nothing) and after Delete everything (checked by Claude in the browser, 2026-11-12)
- [x] Module page: the week panel matches the Home card; the 7-day list shows gaps as "not logged"; focus lands on the page heading; a Home card title opens its page (checked by Claude in the browser, 2026-11-12) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page — superseded 2026-11-13: Home shows score chips and module pages show bars (the new look)
- [x] Module log: saving Sleep keeps today's Work hours, focus task and note; a cleared field is saved as a gap ("not logged"), not 0 (checked by Claude in the browser, 2026-11-12)
- [x] Sleep page Edit: a goal changes the target here and on the Home card; a schedule changes the log to In bed and Up; equal times show the message and keep the form open; Cancel changes nothing (checked by Claude in the browser, 2026-11-12)
- [x] Study page Edit: add up to 5 rows, Remove, typed text kept; the no-name and hours messages; a dated goal shows "in 12 days" (checked by Claude in the browser, 2026-11-12)
- [x] Work page Edit: all six answers save; employed + Mon-Fri 09:00-17:00 gives "Limit 40 h"; a day with no times shows the message; "It varies" with 25 gives "Hours vary · 25 h a week"; a role with HTML shows as text (checked by Claude in the browser, 2026-11-12)
- [x] Saving the log while an Edit form is open closes the form unsaved; Enter in a text field saves the Edit form (checked by Claude in the browser, 2026-11-12)
- [x] Settings shows only Modules, Habits, Goals and Your data (checked by Claude in the browser, 2026-11-12)
- [x] 360 px: the menu is a bottom bar with every link in one row; no sideways scrolling on Home, Sleep, Work, Settings or the Work Edit form; the bar never covers the last panel or the Save and Cancel buttons (checked by Claude in the browser, 2026-11-12)
- [x] Menu and module pages: console shows only the favicon 404; every request goes to 127.0.0.1 (checked by Claude in the browser, 2026-11-12)
- [x] "Skip to content" on a module page moves focus to the content and stays on that page (checked by Claude in the browser, 2026-11-12)
- [x] Cancel on an Edit form puts the details back without a request and keeps an unsaved log entry (checked by Claude in the browser, 2026-11-12)
- [x] Past midnight with a note being typed: the note is saved to the old day, the new day's note starts empty, and focus is not moved (clock moved forward in the browser) (checked by Claude in the browser, 2026-11-12)
- [x] Home: Today's brief, Your modules, Today's focus, Goals, Quick capture, Habits; no log form (checked by Claude in the browser, 2026-11-13) — superseded 2026-11-13: Home shows score chips and module pages show bars (the new look)
- [x] Home module lines: one per module that is on, with value, status in words and target; no data shows a dash and "No data"; a line opens its module page (checked by Claude in the browser, 2026-11-13) — superseded 2026-11-13: Home shows score chips and module pages show bars (the new look)
- [x] Module page: the week panel shows the trend in words (checked by Claude in the browser, 2026-11-13)
- [x] Home at 360 px: no sideways scrolling, module lines not cut off; focus tasks and the habit grid still work (checked by Claude in the browser, 2026-11-13)
- [ ] Narrator: Home's module lines (name, value, status and target read in one go) — superseded 2026-11-13: Home shows score chips and module pages show bars (the new look)
- [x] Home (new look): a score chip per module that opens its page, the Compass score on a gauge with its headline, today's brief, then focus, goals, quick capture, habits (checked by Claude in the browser, 2026-11-13)
- [x] Scores: a week at 92% of its target reads "Good · Close to course" beside "Behind"; only a met target reads "Right on course"; no data shows a dash and "No bearings yet" (server tests + checked by Claude in the browser, 2026-11-13)
- [x] Module page (new look): gauge with the week's value, status, target, score and trend; 7 bars with a dashed daily-target line, empty days shown as a dash; contributors with meters (checked by Claude in the browser, 2026-11-13)
- [x] New look at 360 px and 390 px: no sideways scrolling; the floating tab bar never covers the last panel (checked by Claude in the browser, 2026-11-13)
- [ ] Narrator: a score chip is read as one sentence (name, score, level, value, target, status); the bars are read as "Fri 6: 7.5 h"
- [ ] By eye: contrast of the muted text and the level colours on the darker background
- [x] Check-in on Home: picking a mood, pressing a tag and ticking Rest day each save at once and keep focus on the control; Clear, a second press and unticking undo them (checked by Claude in the browser, 2026-11-13)
- [x] Carry-over: yesterday's unfinished task is offered under Today's focus; one click adds it and the offer goes away; a finished task is not offered (checked by Claude in the browser, 2026-11-13)
- [x] Rest day: a rest day in the week lowers the Study and Work targets ("Target 10.3 h", "1 rest day") and leaves Sleep alone (server tests + checked by Claude in the browser, 2026-11-13)
- [x] Module page: "Last 12 weeks" shows 12 bars; the Sleep page shows "Tonight: aim to be in bed by ..." with a schedule (checked by Claude in the browser, 2026-11-13)
- [x] Insights: opens from the menu, reload stays on it, focus lands on its heading; the weekly review lists each module with its change, extras and one thing to change; patterns and streaks show (checked by Claude in the browser, 2026-11-13)
- [x] Six menu items at 360 px: all in one row, none cut off; no sideways scrolling on Home, Sleep, Insights or Settings (checked by Claude in the browser, 2026-11-13)
- [ ] By hand: use the check-in for a week and read the Insights page; do the patterns and the review say things that are true?
- [ ] Narrator: the mood buttons ("3 out of 5"), the tag buttons (pressed or not), the Insights page
- [ ] Narrator: the menu (current page announced), a module page heading, the 7-day table, the Edit form and where focus goes after Save and Cancel
- [x] A blank log field is saved as a gap: its card says "No data" and the brief ignores it (browser script) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page
- [x] A real `0` stays `0` (browser script: spending 0%)
- [x] Focus tasks: blank rejected, 4th rejected, ticked task stays visible but muted (browser script)
- [x] Habit grid: one click per cell, today and earlier days, weekly completion shown (browser script)
- [x] Goals: add, edit percent, 4th rejected; shown on Home (browser script)
- [x] Quick capture saves about 500 ms after typing stops and on leaving the box (browser script)
- [x] Leave the page open across midnight (or change the clock), switch back to the tab: the date and dashboard move to the new day (by hand)

## 2. Settings and data

- [x] Targets: 0 rejected, a new target changes the card status (browser script) — superseded 2026-11-09: Settings > Targets has no target rows now that Sleep, Study and Work each have their own section — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages
- [x] Export returns all days and settings (browser script)
- [x] Import of a broken file shows an error and changes nothing (browser script)
- [x] Import of a good backup works (browser script)
- [x] Delete everything: Cancel keeps data; Delete returns to onboarding (browser script)
- [x] Full round trip by hand: Export, Delete everything, Import the downloaded file, data is back (by hand)

## 3. Safety

- [x] HTML in task, habit, goal and note text shows as text and never runs (browser script: no pop-up opened)
- [x] The only network host is `127.0.0.1` (browser script watched every request)
- [x] `curl -H "Host: evil.com" http://127.0.0.1:8765/health` returns 403 (curl)
- [x] The server listens on `127.0.0.1` only (netstat while `start.py` ran)
- [x] Stress inputs: 6 modules rejected, 5000-character note limit, `<script>` names (server tests + browser script)

## 4. Accessibility and layout

- [x] Text contrast is at least 4.5:1 everywhere (computed: lowest pair is 6.2:1)
- [x] Status is shown in words ("On track" / "Behind" / "No data"), not colour alone (render tests)
- [x] Layout at 1280 px: no gaps in the grid (screenshot)
- [x] Layout at 360 px: one column, no sideways scrolling (browser script)
- [x] Every control works with the keyboard only (Tab, Shift+Tab, Space, Enter, Esc closes the delete dialog) (by hand)
- [x] Screen reader (e.g. Windows Narrator): form labels, area card labels and habit cell labels are read out sensibly (by hand) — superseded 2026-11-13: Home has one line per module and no log form; logging is on each module's page

## 5. Launcher and importer

- [x] `python start.py` creates/uses `.venv`, installs packages, serves the page (ran it)
- [x] A second `python start.py` on the same port refuses with a clear message (ran it)
- [x] Java importer: dry run sends nothing; real run saves steps and leaves notes, tasks and other numbers alone (ran it against the server). Parked for v2 on 2026-11-08 with Movement; not part of v1 any more.

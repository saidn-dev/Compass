# QA checklist

Manual checks to run before calling v1 done. Start the app with `python start.py`.

`[x]` = checked on 2026-10-27 (how is noted in brackets), by hand on 2026-10-28 (marked "by hand"), or by the onboarding browser script on 2026-10-29. `[ ]` = still needs a person.

## 1. Daily use

- [x] First visit shows onboarding; starting with 0 modules shows the server's message (browser script)
- [x] Onboarding with 3 modules shows 3 area cards and only those 3 log fields (browser script)
- [x] Onboarding: a fresh start shows Welcome, then 5 steps labelled "Step 1 of 5" to "Step 5 of 5"; picking Sleep and another area makes it 6 (browser script)
- [x] Onboarding targets: 0 is rejected with a message; a changed target shows on the dashboard card; the sleep target is kept (browser script)
- [x] Onboarding habits: habits added in the Habits step show in the dashboard habit grid; Remove works; Skip leaves none (browser script)
- [x] Onboarding goals: goals typed in are saved; blank rows are ignored; "Skip for now" finishes with no goals (browser script)
- [x] Onboarding resume: reload on the Targets step: starts at Welcome, areas, Sleep schedule and targets still filled in (browser script)
- [x] Onboarding Back works on every step and keeps saved choices (browser script)
- [x] Onboarding focus lands on each new step heading, and every field has a label (browser script)
- [ ] Onboarding with Narrator: each step heading is read when it appears, the Sleep radio group, time inputs and suggestion are read sensibly
- [x] After onboarding, Settings > Modules still works and does not send you back to onboarding (browser script)
- [x] Sleep page, goal: the hours are saved as the sleep target and shown on the card (browser script)
- [x] Sleep page, schedule: the panel switches, "= 8 h a night" updates as you type, the schedule is saved and sets the target (browser script)
- [x] Sleep page, "Let's work it out": all answered gives a schedule with a tip; all skipped gives an 8 h goal; a shift worker gets no times and a note; Next before a suggestion shows a message (browser script)
- [x] Only Sleep picked: no Targets step; Sleep not picked: no Sleep step (browser script)
- [x] Daily log: schedule users log bed and wake times and the card shows the hours; goal users log hours; after switching to a goal, typed hours win (browser script)
- [x] Brief: with a schedule and 4+ logged bedtimes, "In bed after ... on X of Y nights" shows, with its numbers under "Numbers used" (browser script)
- [x] Settings: Sleep switches between goal and schedule; other targets are kept; target labels point at the Settings inputs (browser script)
- [x] A blank log field is saved as a gap: its card says "No data" and the brief ignores it (browser script)
- [x] A real `0` stays `0` (browser script: spending 0%)
- [x] Focus tasks: blank rejected, 4th rejected, ticked task stays visible but muted (browser script)
- [x] Habit grid: one click per cell, today and earlier days, weekly completion shown (browser script)
- [x] Goals: add, edit percent, 4th rejected; shown on Home (browser script)
- [x] Quick capture saves about 500 ms after typing stops and on leaving the box (browser script)
- [x] Leave the page open across midnight (or change the clock), switch back to the tab: the date and dashboard move to the new day (by hand)

## 2. Settings and data

- [x] Targets: 0 rejected, a new target changes the card status (browser script)
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
- [x] Screen reader (e.g. Windows Narrator): form labels, area card labels and habit cell labels are read out sensibly (by hand)

## 5. Launcher and importer

- [x] `python start.py` creates/uses `.venv`, installs packages, serves the page (ran it)
- [x] A second `python start.py` on the same port refuses with a clear message (ran it)
- [x] Java importer: dry run sends nothing; real run saves steps and leaves notes, tasks and other numbers alone (ran it against the server)

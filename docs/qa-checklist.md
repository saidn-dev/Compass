# QA checklist

Manual checks to run before calling v1 done. Start the app with `python start.py`.

`[x]` = checked on 2026-10-27 (how is noted in brackets). `[ ]` = still needs a person.

## 1. Daily use

- [x] First visit shows onboarding; starting with 0 modules shows the server's message (browser script)
- [x] Onboarding with 3 modules shows 3 area cards and only those 3 log fields (browser script)
- [ ] Onboarding step 2: goals typed in show on the dashboard; blank rows are ignored; "Skip for now" goes straight to the dashboard with no goals
- [x] A blank log field is saved as a gap: its card says "No data" and the brief ignores it (browser script)
- [x] A real `0` stays `0` (browser script: spending 0%)
- [x] Focus tasks: blank rejected, 4th rejected, ticked task stays visible but muted (browser script)
- [x] Habit grid: one click per cell, today and earlier days, weekly completion shown (browser script)
- [x] Goals: add, edit percent, 4th rejected; shown on Home (browser script)
- [x] Quick capture saves about 500 ms after typing stops and on leaving the box (browser script)
- [ ] Leave the page open across midnight (or change the clock), switch back to the tab: the date and dashboard move to the new day

## 2. Settings and data

- [x] Targets: 0 rejected, a new target changes the card status (browser script)
- [x] Export returns all days and settings (browser script)
- [x] Import of a broken file shows an error and changes nothing (browser script)
- [x] Import of a good backup works (browser script)
- [x] Delete everything: Cancel keeps data; Delete returns to onboarding (browser script)
- [ ] Full round trip by hand: Export, Delete everything, Import the downloaded file, data is back

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
- [ ] Every control works with the keyboard only (Tab, Shift+Tab, Space, Enter, Esc closes the delete dialog)
- [ ] Screen reader (e.g. Windows Narrator): form labels, area card labels and habit cell labels are read out sensibly

## 5. Launcher and importer

- [x] `python start.py` creates/uses `.venv`, installs packages, serves the page (ran it)
- [x] A second `python start.py` on the same port refuses with a clear message (ran it)
- [x] Java importer: dry run sends nothing; real run saves steps and leaves notes, tasks and other numbers alone (ran it against the server)

# Work onboarding pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six one-question Work screens in onboarding and a Settings > Work section, whose answers set the Work target and direction, add a line to the Work card, and pick the brief's Work tip.

**Architecture:** A new `WorkProfile` lives in Settings. Python owns every rule: weekly hours from a schedule, syncing the Work target, the tip, and the card text (`server/app/work.py`, `settings_rules.py`). The page draws one question at a time in onboarding, or all six in Settings, from shared renderers in `render.js`, and saves with `PUT /api/settings`. The onboarding Targets step is removed.

**Tech Stack:** Python 3.12, FastAPI, pydantic, pytest | vanilla JS (ES modules), `node:test` | HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-11-08-work-onboarding-design.md`. Read it with this plan: the screen copy, messages and tip table are there and are used word for word.

## Global Constraints
- No git at all (not even status): the user reviews and commits. Every "Commit" step means "stop and report: files changed, tests run".
- Python owns every rule (target, mode, tip, card text). JS only draws what the API returns and checks form input before sending.
- A blank entry is a gap, never 0. Blank text (role, goal) becomes `null`.
- Plain HTML/CSS/vanilla JS, existing tokens and classes, dark theme only, contrast 4.5:1 or more. No new dependencies.
- Every input has a label. Focus moves to each new screen's heading.
- Only `127.0.0.1` requests. The browser check uses a scratch database on port 8766 and never touches `compass.db`.
- Minimal HTML/CSS comments; JS comments in the existing plain-English style.
- Test commands: `.venv/Scripts/python.exe -m pytest server/tests -q` and `node --test web/tests/*.test.js` (run from the repo root; the shell expands the glob). Baseline: 343 passed and 35 passed.

## Review Focus
1. **The Work tips contain numbers** ("30 minutes", "10 minutes"). `test_every_number_in_the_sentences_is_in_facts` skips only `SUGGESTIONS`, so every possible tip must be added there or that test fails for the wrong reason. (Task 3)
2. **Saved settings and backups from before this round** have no `work` key. They must load and import with an empty profile. (Task 1)
3. **Work unticked, then ticked again** with a schedule saved: unticked leaves the target alone; ticking it again (`POST /api/onboarding`) sets the target back from the schedule. (Task 2)
4. **Settings > Targets or Sleep saves send a stale Work target.** With a schedule saved, the server keeps the target equal to the schedule's hours whatever the page sends. (Task 2)
5. **HTML in role and goal text** shows as text on the card and in the Settings and onboarding fields. (Task 4)

---

### Task 1: Data model

**Files:**
- Modify: `server/app/models.py` (after `StudyGoal`, and the `Settings` class)
- Test: `server/tests/test_models.py`, `server/tests/test_db.py`

**Interfaces:**
- Produces:
  - `WORK_KINDS = ("employed", "freelance", "student", "job_hunting", "other")`
  - `WORK_FOCUS = ("morning", "afternoon", "evening", "varies")`
  - `DERAILERS = ("priorities", "procrastination", "interruptions", "energy", "projects", "other")` (screen order)
  - `WorkSchedule(BaseModel)`: `days: list[int]`, `start: str`, `end: str`
  - `WorkProfile(BaseModel)`: `kind: Literal[*WORK_KINDS] | None = None`, `role: Name | None = None`, `schedule: WorkSchedule | None = None`, `hours_vary: bool = False`, `focus: Literal[*WORK_FOCUS] | None = None`, `goal: Name | None = None`, `derailers: list[Literal[*DERAILERS]] = []`
  - `Settings.work: WorkProfile = WorkProfile()`

- [ ] **Step 1: Write the failing tests** in `test_models.py`:
  - `test_work_profile_defaults_are_empty`: `Settings().work == WorkProfile()`, and `WorkProfile().model_dump() == {"kind": None, "role": None, "schedule": None, "hours_vary": False, "focus": None, "goal": None, "derailers": []}`
  - `test_work_schedule_accepts_a_normal_week`: `WorkSchedule(days=[0, 1, 2, 3, 4], start="09:00", end="17:00")` works; `start=" 9:00"` is cleaned the way `parse_time` cleans sleep times.
  - `test_work_schedule_rejects_bad_input` (parametrized, each raises `ValidationError`): `days=[]`; `days=[0, 0]`; `days=[7]`; `days=[-1]`; `start="25:00"`; `start="09:00", end="09:00"`
  - `test_work_text_blank_becomes_none`: `WorkProfile(role="   ", goal="").role is None` and `.goal is None`; `WorkProfile(role=" Nurse ").role == "Nurse"`; a 101-character goal raises.
  - `test_work_derailers_keep_screen_order_and_reject_repeats`: `WorkProfile(derailers=["energy", "priorities"]).derailers == ["priorities", "energy"]`; `["energy", "energy"]` raises; `["boredom"]` raises.
  - `test_hours_vary_with_a_schedule_is_rejected`: `WorkProfile(hours_vary=True, schedule={...Mon-Fri 9-5})` raises.
  - `test_unknown_kind_and_focus_are_rejected`: `kind="boss"` and `focus="night"` raise.
- [ ] **Step 2: Write the failing backup tests** in `test_db.py`:
  - `test_old_backup_without_work_imports`: like `test_old_backup_without_study_goals_imports`, then `repo.get_settings().work == WorkProfile()`.
  - `test_work_profile_survives_export_and_import`: put settings with `modules=["work"]`, a full profile (kind `"freelance"`, role, Mon-Fri 09:00-17:00, focus `"morning"`, goal, derailers `["procrastination"]`); export, import into a fresh repo; `fresh.get_settings().work` equals it.
  - `test_saved_settings_without_work_load`: raw settings JSON without `work` in the table loads with `work == WorkProfile()`.
- [ ] **Step 3: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_models.py server/tests/test_db.py -q`. Expected: FAIL (`WorkProfile` can't be imported).
- [ ] **Step 4: Implement** the names above in `models.py`. Times use `parse_time` with the same message as `SleepSchedule`. Messages for the day rules: "Pick at least one day.", "Pick each day only once.", and "Days are 0 (Monday) to 6 (Sunday)." Equal times: "Start and end can't be the same." `role`/`goal` use a `mode="before"` validator that turns blank or whitespace into `None`. `derailers` are sorted by `DERAILERS.index`.
- [ ] **Step 5: Run** both test files, then the full suite. Expected: all pass.
- [ ] **Step 6: Stop and report** (no commit).

### Task 2: Work rules and target sync

**Files:**
- Create: `server/app/work.py`
- Modify: `server/app/settings_rules.py` (`check_settings`, `apply_onboarding`, new `sync_work_target`), `server/app/db.py:148` (`_validate_backup`), `server/app/areas.py` (Work `suggestion`)
- Test: `server/tests/test_work.py` (new), `server/tests/test_settings_rules.py`, `server/tests/test_api.py`, `server/tests/test_db.py`

**Interfaces:**
- Consumes: `WorkProfile`, `WorkSchedule`, `DERAILERS` (Task 1); `hours_between` from `app.sleep`.
- Produces:
  - `week_hours(schedule: WorkSchedule) -> float`: `len(days) * hours_between(start, end)`, rounded to 2 decimals
  - `work_tip(profile: WorkProfile, mode: str) -> str`
  - `work_card(profile: WorkProfile) -> dict | None`: `{"text": str}` or `None`
  - `ALL_WORK_TIPS: list[str]`: every string `work_tip` can return (for tests)
  - `sync_work_target(s: Settings) -> Settings` in `settings_rules.py`

- [ ] **Step 1: Write the failing tests** in `test_work.py`:
  - `test_week_hours`: Mon-Fri 09:00-17:00 gives `40`; `[5]` 22:00-06:00 gives `8`; one day 09:00-12:30 gives `3.5`; all 7 days 00:00-23:00 gives `161`.
  - `test_tip_for_each_derailer` (parametrized over the spec's table, `mode="up"`, `focus=None`): e.g. `procrastination` gives `"Spend 10 minutes today on the task you've been putting off."`
  - `test_tip_fills_in_focus_time`: focus `"morning"` + `priorities` gives `"Pick the one task that matters most this week and give it 30 minutes in the morning."`; `"varies"` gives "today".
  - `test_tip_uses_the_first_derailer_in_screen_order`: `["interruptions", "priorities"]` gives the priorities tip.
  - `test_something_else_only_gives_the_general_tip`: `["other"]` + evening gives `"Block 30 minutes in the evening for your most urgent task."`
  - `test_limit_mode_gives_the_stop_tip`: with an empty profile and with a full profile, `mode="limit"` gives `"Pick a time to stop work today and keep to it."`
  - `test_empty_profile_tip`: `work_tip(WorkProfile(), "up") == "Block 30 minutes today for your most urgent task."`
  - `test_all_work_tips_covers_every_case`: every result in the tests above is in `ALL_WORK_TIPS`, and `len(ALL_WORK_TIPS) == 6 * 4 + 1` (6 templates × 4 `{when}` values, plus the stop tip).
  - `test_card_text`: role + goal gives `{"text": "Software developer · Goal: Fix 3 bugs"}`; role only gives `{"text": "Software developer"}`; goal only gives `{"text": "Goal: Fix 3 bugs"}`; neither gives `None`.
- [ ] **Step 2: Write the failing sync tests** in `test_settings_rules.py`:
  - `test_work_schedule_sets_the_target`: `check_settings` with `modules=["work"]` and Mon-Fri 9-5 gives a work `Target(target=40, mode="up")`.
  - `test_employed_sets_stay_under`: kind `"employed"` gives mode `"limit"`; kind `"freelance"`, `"student"`, `"job_hunting"`, `"other"` give `"up"`.
  - `test_no_kind_keeps_the_saved_mode`: a saved work target in `limit` mode with a schedule and no kind keeps `limit`, with the schedule's hours.
  - `test_empty_profile_changes_nothing`: `check_settings(s) == s` for settings with a custom work target and an empty profile.
  - `test_work_unticked_leaves_the_target_alone`: `modules=["sleep"]`, a schedule saved, a stale work target of 10 stays 10.
  - `test_ticking_work_again_resyncs` (Review Focus 3): `apply_onboarding(s, ["work"])` on settings with a Mon-Fri 9-5 schedule gives target 40.
  - `test_hours_vary_keeps_the_typed_target`: `hours_vary=True`, kind `"employed"`, work target 25 gives `Target(25, "limit")`.
- [ ] **Step 3: Write the failing API and backup tests:**
  - `test_api.py::test_stale_work_target_is_replaced_by_the_schedule` (Review Focus 4): `PUT /api/settings` with a Mon-Fri 9-5 schedule and a work target of 12 returns, and stores, target 40.
  - `test_api.py::test_bad_work_schedule_is_rejected`: equal times give a 422 error shape.
  - `test_db.py::test_backup_work_target_is_synced_on_import`: a backup with a schedule and a disagreeing target imports with target 40.
- [ ] **Step 4: Run** the four files. Expected: FAIL (no `app.work`, no `sync_work_target`).
- [ ] **Step 5: Implement** `work.py` with the names above. Tip templates and the stop tip are copied word for word from the spec's "The brief's Work tip" section; `{when}` is `"in the morning" | "in the afternoon" | "in the evening"`, and `"today"` for `"varies"` or `None`. The order: `limit` first, then the first derailer that isn't `"other"`, then the general tip.
- [ ] **Step 6: Implement** `sync_work_target` next to `sync_sleep_target`. If `"work"` isn't in `s.modules`, return `s`. The mode is `"limit"` if kind is `"employed"`, `"up"` for any other kind, else the saved mode (or the area default). The target is `week_hours(schedule)` if there's a schedule, else the saved target (or the area default). Only write a work `Target` when kind or schedule is set; otherwise return `s` unchanged. Call it right after `sync_sleep_target` in `check_settings`, `apply_onboarding` and `_validate_backup`. A schedule result over 168 goes through `check_cap` (it can't happen with valid times, but the cap stays the single rule).
- [ ] **Step 7: Change** the Work `suggestion` in `areas.py` to `"Block 30 minutes today for your most urgent task."` and fix any test that asserts the old sentence.
- [ ] **Step 8: Run** the full suite. Expected: all pass.
- [ ] **Step 9: Stop and report.**

### Task 3: Brief tip and dashboard card

**Files:**
- Modify: `server/app/brief.py` (the `sentences = [first, second, area.suggestion]` line), `server/app/dashboard.py` (the per-area `entry`)
- Test: `server/tests/test_brief.py`, `server/tests/test_api.py`

**Interfaces:**
- Consumes: `work_tip`, `work_card`, `ALL_WORK_TIPS` (Task 2).
- Produces: dashboard Work entry `goal: {"text": str} | None`. The page already renders `area.goal.text`.

- [ ] **Step 1: Write the failing tests** in `test_brief.py`:
  - Change `SUGGESTIONS = {a.suggestion for a in AREAS} | set(ALL_WORK_TIPS)` (Review Focus 1).
  - `test_work_tip_replaces_the_fixed_suggestion`: Work furthest behind, profile with `derailers=["procrastination"]`, `focus="morning"`: sentence 3 is `"Spend 10 minutes in the morning on the task you've been putting off."`
  - `test_work_limit_gives_the_stop_tip`: `work_limit(40)` with `work_hours=[10]*7` (over the limit): sentence 3 is the stop tip.
  - `test_work_tip_only_when_work_is_the_focus`: Sleep furthest behind with Work also picked: no Work tip in the sentences.
  - Add to `test_every_number_in_the_sentences_is_in_facts` a case with Work behind and `derailers=["procrastination"]`.
- [ ] **Step 2: Write the failing dashboard tests** in `test_api.py`:
  - `test_dashboard_work_card_line`: settings with Work, role `"Software developer"`, goal `"Fix 3 bugs"`: the Work entry's `goal == {"text": "Software developer · Goal: Fix 3 bugs"}`.
  - `test_dashboard_work_card_without_profile_has_no_line`: `goal is None`; the Sleep entry has no `goal` key.
- [ ] **Step 3: Run** both files. Expected: FAIL.
- [ ] **Step 4: Implement:** in `build_brief` the third sentence is `work_tip(settings.work, mode)` when `area.id == "work"`, otherwise `area.suggestion` (`mode` is the focus area's mode, already in scope). In `build_dashboard`, `entry["goal"] = work_card(settings.work)` when `area.id == "work"`.
- [ ] **Step 5: Run** the full suite. Expected: all pass.
- [ ] **Step 6: Stop and report.**

### Task 4: Work renderers

**Files:**
- Modify: `web/js/render.js` (a new `// --- Work ---` section after Study)
- Test: `web/tests/render.test.js`

**Interfaces:**
- Produces:
  - `WORK_QUESTIONS: string[]`: the six questions, word for word from the spec, in screen order.
  - `renderWorkQuestion(index: number, work: WorkProfile, hours: number | string, prefix: string, { hideLegend = false } = {}) -> string`: one `<fieldset class="work-question" data-work="${index}">` with `<legend>` = `WORK_QUESTIONS[index]` (with class `visually-hidden` when `hideLegend`) and that screen's controls, pre-filled from `work`.
  - `weekHoursText(dayCount: number, start: string, end: string) -> string`: `"= 40 h a week"`, or `""` when there are no days or a time is missing or both times are equal.
- Control names (used by app.js in Tasks 5 and 6):
  - 0: radios `name="work-kind"`, values = `WORK_KINDS`, labels "Employed", "Freelance or self-employed", "Student who works", "Looking for work", "Other".
  - 1: text `name="work-role"`, `maxlength="100"`, with the spec's hint.
  - 2: seven `<button type="button" class="day-toggle" data-day="0".."6" aria-pressed="true|false">` labelled Mon to Sun inside a `role="group"` with a visually hidden "Days" label; time inputs `name="work-start"`, `name="work-end"`; `<output class="work-week">` with `weekHoursText`; a checkbox `name="work-varies"`; a hours input `name="work-hours"` (min 0, max 168, step any) inside `<div class="work-varies-panel">`, hidden unless `hours_vary`. When `hours_vary` is true the schedule part is hidden and the box is ticked.
  - 3: radios `name="work-focus"`, values = `WORK_FOCUS`, labels "Morning", "Afternoon", "Evening", "It varies".
  - 4: text `name="work-goal"`, `maxlength="100"`, with the spec's hint.
  - 5: checkboxes `name="work-derailer"`, values = `DERAILERS`, labels "Unclear priorities", "Putting things off", "Interruptions", "Low energy", "Too many projects", "Something else".
  - Ids: `${prefix}-work-...`, so onboarding (`"onb"`) and Settings (`"set"`) never clash.

- [ ] **Step 1: Write the failing tests** (add the new names to the import list):
  - `renderWorkQuestion redraws saved answers`: kind `"student"` gives the `student` radio `checked`; derailers `["energy"]` gives only that checkbox `checked`; Mon-Fri 9-5 gives 5 `aria-pressed="true"` buttons and `value="09:00"`.
  - `renderWorkQuestion screen 3 with hours_vary`: the varies box is `checked`, and the hours input has the given hours.
  - `renderWorkQuestion escapes role and goal` (Review Focus 5): role `EVIL` doesn't appear raw, and `&lt;script&gt;` does.
  - `renderWorkQuestion uses the prefix in ids`: `"onb"` and `"set"` give different `id=` values, and every `id` has a matching `for=` (or the group's `aria-labelledby`).
  - `renderWorkQuestion hides the legend when asked`: `hideLegend` gives `class="visually-hidden"` on the legend.
  - `weekHoursText`: `(5, "09:00", "17:00")` gives `"= 40 h a week"`; `(1, "22:00", "06:00")` gives `"= 8 h a week"`; `(0, "09:00", "17:00")`, `(5, "", "17:00")` and `(5, "09:00", "09:00")` give `""`.
  - `renderAreaCard shows the Work line`: a Work card with `goal: { text: "Software developer · Goal: Fix 3 bugs" }` shows the text and puts it in the `aria-label`.
- [ ] **Step 2: Run** `node --test web/tests/*.test.js`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the exports. Reuse `escapeHtml` and the existing `hoursInput`/`timeInputs` helpers where their markup fits. `WORK_KINDS`, `WORK_FOCUS` and `DERAILERS` are repeated in render.js as constants (the same pattern as `MAX_STUDY_GOALS`; the server is the one that enforces them).
- [ ] **Step 4: Run** the web tests. Expected: all pass.
- [ ] **Step 5: Stop and report.**

### Task 5: Onboarding Work screens (and the Targets step removed)

**Files:**
- Modify: `web/index.html` (a new `#onboarding-step-work` after the Study step; delete `#onboarding-step-targets`), `web/styles.css` (`.day-toggle`, `[aria-pressed="true"]`, `.work-week`, `.step-sub`, near the onboarding sleep styles), `web/js/app.js` (the Onboarding section and a new "Work answers" section after "Study answers")

**Interfaces:**
- Consumes: `renderWorkQuestion`, `WORK_QUESTIONS`, `weekHoursText` (Task 4).
- Produces (app.js, used again in Task 6):
  - `readWorkAnswer(index: number, container: Element) -> { changes: object, hours?: number, error?: string }`: `changes` is a partial `WorkProfile`.
  - `withWork(current: Settings, changes: object, hours?: number) -> Settings`: merges `changes` into `current.work`; with `hours` (It varies) it also merges a work target `{target: hours, mode: saved mode or "up"}` through `mergeTargets`.

- [ ] **Step 1: HTML.** `#onboarding-step-work` holds `<p class="step-label">`, `<p class="step-sub" id="onboarding-work-sub">`, `<h2 id="onb-heading-work" tabindex="-1">` (the text is set from `WORK_QUESTIONS`), and a form `#onboarding-work-form` with `<div id="onboarding-work">`, an error line `#onboarding-work-error`, and Back (`data-back`), Skip (`#onboarding-work-skip`, `type="button"`) and Next (submit).
- [ ] **Step 2: app.js state and flow.**
  - `ALL_STEPS = ["welcome", "modules", "sleep", "study", "work", "habits", "goals"]`; `OWN_PAGE = ["sleep", "study", "work"]`; delete `drawOnboardingTargets`, the Targets submit handler and `"onboarding-targets-error"` from `showOnboarding`.
  - `onboardingSteps()`: welcome, modules, then sleep/study/work if picked, then habits, goals.
  - `let workScreen = 0`. `drawOnboardingWork()` fills `#onboarding-work` with `renderWorkQuestion(workScreen, settings.work, workHours(), "onb", { hideLegend: true })`, sets the heading to `WORK_QUESTIONS[workScreen]`, sets `#onboarding-work-sub` to `Work · ${workScreen + 1} of 6`, and clears the error. `workHours()` is the saved work target or the area default (like `studyHours()`).
  - `nextStep()`: on `"work"` with `workScreen < 5`, stay on work with `workScreen + 1`. Entering work from an earlier step starts at screen 0.
  - Back: on work with `workScreen > 0` goes to `workScreen - 1`; Back from habits goes to work screen 5 when work is in the steps; otherwise as today.
  - Every Work screen change calls `showOnboardingStep("work")`, so focus lands on the heading.
- [ ] **Step 3: Reading and checking** in `readWorkAnswer`:
  - 0 kind, 3 focus: the ticked radio; nothing ticked gives `changes = {}` (the same as Skip).
  - 1 role, 4 goal: trimmed text; blank gives `null`.
  - 2: varies ticked gives `{ changes: { hours_vary: true, schedule: null }, hours }`, where hours must be above 0 and at most 168, or "Hours a week must be between 0 and 168." Otherwise the pressed days are needed ("Pick at least one day."), both times ("Enter a start and end time."), and different times ("Start and end can't be the same."), giving `{ changes: { hours_vary: false, schedule: { days, start, end } } }`.
  - 5 derailers: the ticked values in screen order.
- [ ] **Step 4: Handlers.** Next: `readWorkAnswer`; on error, show it; otherwise `settings = await api.putSettings(withWork(settings, changes, hours))`, then the next screen or step. Server errors go in `#onboarding-work-error`. Skip: next screen or step with nothing saved. A document-level click on `.day-toggle` flips `aria-pressed`; any change inside a `.work-question` with schedule controls updates its `.work-week` output with `weekHoursText`, and ticking `work-varies` toggles which part is hidden.
- [ ] **Step 5: Browser check** (Playwright MCP tools; the server from the Study round's way: `create_app(<scratch db>)` on `127.0.0.1:8766`, run from the repo root, with a scratch db in the session's tmp folder). Onboard with Work only: "Step 3 of 5" then "Work · 1 of 6" to "6 of 6"; each Next message on screen 3; Back through all six and from Habits; reload, then come back to screen 3 and check the answers are redrawn. Onboard with Sleep + Study + Work: no Targets step. No console errors other than the favicon 404; only `127.0.0.1` requests.
- [ ] **Step 6: Run** both suites. Expected: all pass (server count unchanged by this task, web count unchanged).
- [ ] **Step 7: Stop and report.**

### Task 6: Settings > Work, the Targets panel, and the log label

**Files:**
- Modify: `web/index.html` (a new `#settings-work-panel` after `#settings-study-panel`, with `#work-form`, `#settings-work`, `#work-error` and `#work-status`; give the Targets section `id="settings-targets-panel"`), `web/js/app.js` (`drawSettings`, a `#work-form` submit handler, `fillLogForm`)

**Interfaces:**
- Consumes: `renderWorkQuestion` (Task 4); `readWorkAnswer`, `withWork` (Task 5).

- [ ] **Step 1: drawSettings.** `#settings-work-panel` is shown only with Work picked; `#settings-work` is all six `renderWorkQuestion(i, settings.work, workHours(), "set")` joined. `#settings-targets-panel` is hidden when Sleep isn't picked. Add `"work-error"` to the list of errors cleared.
- [ ] **Step 2: Save work.** Read all six with `readWorkAnswer`; the first error goes in `#work-error`; otherwise merge every screen's `changes` (and the screen-3 hours) with `withWork`, then `saveSettings` and show "Saved" in `#work-status`. Clear the status on any input inside the form.
- [ ] **Step 3: Log label.** In `fillLogForm`, the label for `#log-work_hours` reads "Job search" when `settings.work.kind === "job_hunting"`, otherwise "Paid work".
- [ ] **Step 4: Browser check** (same scratch server): Settings > Work saves a change from freelance to employed and the card's target text changes from "Target" to "Limit"; Mon-Fri 9-5 gives "Limit 40 h"; "It varies" with 25 saves 25 and clears the schedule; Sleep and Study settings are unchanged after saving Work; Settings > Targets still saves Sleep's goal and schedule, and is hidden with Sleep unticked; a job hunter's log label says "Job search"; Skip on all six onboarding screens gives "Target 16 h". Screenshots at 1280 px and 360 px (no sideways scroll at 360 px). Console and request hosts as in Task 5.
- [ ] **Step 5: Run** both suites. Expected: all pass.
- [ ] **Step 6: Stop and report.**

### Task 7: Preview, docs and QA checklist

**Files:**
- Modify: `web/preview.html` (the Work card gets a `card-goal` line "Software developer · Goal: Fix 3 bugs" and a value instead of "No data", keeping one "No data" example on another card), `docs/qa-checklist.md`, `README.md`, `FEATURES.md`, `2026-10-21-compass-v1-sdp.md` (the data-model block gets `work` and a dated 2026-11-09 note; the dashboard API row mentions the Work `goal`)
- Create: `docs/areas/work.md` (same layout as `docs/areas/study.md`: field, default target, the tips, the profile, where it's defined)

- [ ] **Step 1:** Update each file. README: the onboarding feature row gains the Work screens; the "three modules" table's Work row says the target comes from your work days and hours, or a typed number; test counts updated.
- [ ] **Step 2:** QA checklist section 1 gets Work items, ticked with how each was checked in Tasks 5 and 6. "Narrator: Work screens (headings, day buttons, It varies, focus)" stays unticked for the user.
- [ ] **Step 3: Run** both suites one last time and record the counts in README.
- [ ] **Step 4: Stop and report.** Then explain the code in build order (data, rules, API, HTML, CSS, render.js, app.js): what each piece does, why, and how to rebuild it.

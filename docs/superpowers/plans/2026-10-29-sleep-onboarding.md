# Sleep Onboarding Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sleep its own onboarding page (goal, schedule, or "Let's work it out"), let schedule users log bed and wake times, and add a bedtime line to the brief.

**Architecture:** The Python server owns every rule. That covers time parsing, hours from times, suggestions, schedule-to-target sync, and the brief line, all in a new `server/app/sleep.py` plus small changes to models, settings rules and brief. The page renders what the API returns: `render.js` gets pure renderers, and `app.js` wires the new step, the log fields and the Settings row. `sleep_hours` stays the field the card, trend and status read, so the rest of the dashboard is unchanged.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, pytest; vanilla HTML/CSS/JS ES modules, `node:test`; headless Edge over CDP for the browser check.

**Spec:** `docs/superpowers/specs/2026-10-29-sleep-onboarding-design.md`

## Global Constraints
- Python runs from `.venv`: `.venv/Scripts/python.exe -m pytest server/tests`. JS tests: `node --test "web/tests/*.test.js"`.
- A blank entry is a gap (`None`/`null`), never 0. This applies to the new time fields too.
- Times are `"HH:MM"`, 24-hour, 00:00-23:59.
- Errors leave the server as `{"error": {"code", "message"}}`. A `ValueError` becomes 422 `invalid` (`server/app/main.py:24`).
- All user text goes through `escapeHtml`. Every input has a `<label>`. The radio choices sit in a `fieldset` with a `legend`.
- Dark theme only. Use the existing tokens and classes, keep contrast at 4.5:1 or above, and don't let the page scroll sideways at 360 px.
- HTML and CSS only get comments where something really needs explaining. JS comments match `app.js`: short, plain lines above each block.
- Exact copy:
  - "Do you already know what you want from your sleep?"
  - "I have a sleep goal"
  - "I have a sleep schedule"
  - "Let's work it out"
  - "Answer what you like. Anything you skip is left out."
  - "Show my suggestion"
  - "General guidance, not medical advice."
  - "Shift work makes a fixed schedule hard; an hours-a-night goal may suit you better."
  - The habit tips are listed in the spec.
- **No git.** Each task ends with a checkpoint: list the files changed and the test results to the user. The user commits.

## Review Focus
1. Saving the onboarding or Settings targets when sleep isn't one of the rows keeps the existing sleep target. Today the targets array is replaced whole (`app.js:169`, `app.js:424`). Pinned in Task 6/7 (`mergeTargets`) and checked in the Task 8 script.
2. Someone switches from a schedule to a goal, then logs hours on a day that already has times. The hours they typed win. The page sends `bedtime: null, wake_time: null` with goal-mode hours. Pinned in Task 1 (API test) and Task 7.
3. Only one time entered (bedtime but no wake time) gives a sleep gap, not stale hours. In schedule mode the page sends `sleep_hours: null`. Pinned in Task 1.
4. Odd time strings: `"23:00:00"` (some browsers add seconds) is accepted as `"23:00"`. `"11pm"`, `"24:00"` and `"7:5"` become gaps. Pinned in Task 1.
5. Bedtimes around midnight: planned 23:30 and actual 00:15 is 45 minutes late, actual 23:00 is early, and planned 00:30 with actual 23:50 is early. Pinned in Task 4.

---

### Task 1: Time helpers and Day time fields

**Files:**
- Create: `server/app/sleep.py`
- Modify: `server/app/models.py` (`normalize_day`, line 89)
- Test: `server/tests/test_sleep.py` (new), `server/tests/test_models.py`, `server/tests/test_api.py`

**Interfaces:**
- Produces:
  - In `app.sleep`: `parse_time(value: object) -> str | None`, `hours_between(bedtime: str, wake_time: str) -> float | None`.
  - Day dicts gain `"bedtime"` and `"wake_time"` (`str | None`).
  - `sleep.py` imports nothing from `app` (to avoid circular imports).

- [ ] **Step 1: Write failing tests** in `test_sleep.py`:
  - `parse_time("22:30") == "22:30"`, `parse_time("07:05") == "07:05"`, `parse_time("23:00:00") == "23:00"`.
  - Each of `["", None, "11pm", "24:00", "7:5", "12:60", 2230, True]` gives `None`.
  - `hours_between("23:00", "06:30") == 7.5`, `hours_between("22:30", "06:30") == 8`, `hours_between("01:00", "09:00") == 8`.
  - `hours_between("23:10", "06:35") == 7.42`, `hours_between("22:00", "22:00") is None`.

  In `test_models.py`:
  - Update `test_unknown_keys_dropped_and_shape_complete` to expect `{"date", "habits", "tasks", "note", "bedtime", "wake_time", *NUMERIC_FIELDS}`.
  - Add `test_both_times_set_sleep_hours`: `normalize_day({"bedtime": "23:00", "wake_time": "06:30", "sleep_hours": 3}, DATE)["sleep_hours"] == 7.5`.
  - Add `test_one_time_keeps_sent_hours`: `{"bedtime": "23:00", "sleep_hours": 6}` gives `sleep_hours == 6` and `wake_time is None`.
  - Add `test_equal_times_give_a_gap`: `{"bedtime": "22:00", "wake_time": "22:00", "sleep_hours": 6}` gives `sleep_hours is None`.
  - Add `test_junk_time_is_a_gap`: `{"bedtime": "11pm"}` gives `bedtime is None`.

  In `test_api.py` (Review Focus 2 and 3):
  - `test_put_day_with_times_works_out_hours`: PUT `{bedtime: "23:00", wake_time: "06:30"}`, then GET has `sleep_hours == 7.5`.
  - `test_goal_hours_win_when_times_cleared`: PUT the times, then PUT `{sleep_hours: 6, bedtime: None, wake_time: None}`, then `sleep_hours == 6`.
  - `test_partial_times_with_null_hours_is_a_gap`: PUT `{bedtime: "23:00", wake_time: None, sleep_hours: None}`, then `sleep_hours is None`.
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_sleep.py server/tests/test_models.py server/tests/test_api.py -q`. Expect: the new tests FAIL because `app.sleep` is missing and the keys are missing.
- [ ] **Step 3: Implement** `parse_time` (regex `^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$`, only on `str`) and `hours_between` in `sleep.py`. `hours_between` is the minutes difference mod 1440, divided by 60 and rounded to 2 places, with 0 giving `None`. In `normalize_day`, after the numeric loop, set `day["bedtime"]` and `day["wake_time"]` with `parse_time`. When both are present, set `day["sleep_hours"] = hours_between(...)`, which overrides whatever was sent.
- [ ] **Step 4: Run** the full suite `.venv/Scripts/python.exe -m pytest server/tests -q`. Expect everything to PASS.
- [ ] **Step 5: Checkpoint** (no git). Report the files changed and the test count.

### Task 2: Sleep schedule in Settings, synced to the sleep target

**Files:**
- Modify: `server/app/models.py` (`Settings`, line 126), `server/app/settings_rules.py` (`check_settings`, `apply_onboarding`)
- Test: `server/tests/test_settings_rules.py`, `server/tests/test_api.py`

**Interfaces:**
- Consumes: `parse_time` and `hours_between` from Task 1.
- Produces:
  - `class SleepSchedule(BaseModel): bedtime: str; wake_time: str`. Both are run through `parse_time`. A bad time raises `ValueError("Times must look like HH:MM, e.g. 22:30.")`, and equal times raise `ValueError("Bedtime and wake-up time must be different.")`.
  - `Settings.sleep_schedule: SleepSchedule | None = None`.
  - `sync_sleep_target(s: Settings) -> Settings` in `settings_rules.py`. When `s.sleep_schedule` is set and `"sleep" in s.modules`, the sleep target becomes `Target("sleep", hours_between(...), "up")` (replaced, or appended if missing). Otherwise `s` is returned unchanged. Both `check_settings` and `apply_onboarding` return through it.

- [ ] **Step 1: Write failing tests:**
  - `test_schedule_sets_sleep_target`: `check_settings` of onboarded `["sleep", "study"]` with schedule 22:30/06:30 gives the sleep target `8.0` and mode `"up"`. The study target is unchanged.
  - `test_schedule_ignored_when_sleep_not_enabled`: modules `["study"]` plus a schedule leaves the targets unchanged.
  - `test_apply_onboarding_keeps_schedule_target`: settings with a schedule, re-onboarded with `["sleep"]`, keep the sleep target from the schedule.
  - `test_equal_schedule_times_rejected` and `test_bad_schedule_time_rejected` (`"25:00"`): constructing `Settings` raises `ValidationError`.
  - API: `test_put_settings_with_schedule_round_trips`: PUT, then GET has `sleep_schedule == {"bedtime": "22:30", "wake_time": "06:30"}` and the sleep target is 8.
  - API: `test_put_settings_with_equal_times_is_rejected` gives 422 in the error shape.
  - API: `test_import_of_backup_without_schedule_still_works`: export, delete `sleep_schedule` from the settings and `bedtime`/`wake_time` from the days, then import gives 200.
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_settings_rules.py server/tests/test_api.py -q`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement** `SleepSchedule` (a `field_validator` for both fields, a `model_validator(mode="after")` for the equal check), the `Settings` field, and `sync_sleep_target`.
- [ ] **Step 4: Run** the full suite. Expect PASS.
- [ ] **Step 5: Checkpoint.**

### Task 3: Suggestion rules and `POST /api/sleep/suggestion`

**Files:**
- Modify: `server/app/sleep.py`, `server/app/routes.py`, `web/js/api.js`
- Test: `server/tests/test_sleep.py`, `server/tests/test_api.py`

**Interfaces:**
- Produces:
  - `Age = Literal["under_18", "18_25", "26_64", "65_plus"]`
  - `Role = Literal["student", "employed", "self_employed", "shift_worker", "unemployed", "other"]`
  - `HabitId = Literal["alcohol", "caffeine", "screens", "naps", "late_meals", "nicotine"]`
  - `AGES: dict[str, tuple[float, str]]`: `{"under_18": (9, "8-10 h"), "18_25": (8, "7-9 h"), "26_64": (8, "7-9 h"), "65_plus": (7.5, "7-8 h")}`. `DEFAULT_AGE = (8, "7-9 h")`.
  - `HABIT_TIPS: dict[str, str]` holds the spec's tips, with keys in the `HabitId` order above. `SHIFT_NOTE` is the spec's note.
  - `time_minus_hours(hhmm: str, hours: float) -> str`: wraps past midnight and rounds to the minute.
  - `suggest(age: str | None, role: str | None, habits: list[str], wake_time: str | None) -> dict` returns `{"hours": float, "range": str, "bedtime": str | None, "wake_time": str | None, "tips": list[str], "notes": list[str]}`. A `wake_time` that isn't empty but fails `parse_time` raises `ValueError("Wake-up time must look like HH:MM.")`.
  - `routes.py`: `class SleepAnswers(BaseModel): age: Age | None = None; role: Role | None = None; habits: list[HabitId] = []; wake_time: str | None = None`. `POST /api/sleep/suggestion` returns `suggest(**body.model_dump())`.
  - `api.js`: `getSleepSuggestion(answers)`, which POSTs to `/api/sleep/suggestion`.

- [ ] **Step 1: Write failing tests:**
  - `suggest(None, None, [], None) == {"hours": 8, "range": "7-9 h", "bedtime": None, "wake_time": None, "tips": [], "notes": []}`.
  - Parametrized over `AGES`: the hours and range match.
  - `suggest("18_25", "student", [], "06:30")` has `bedtime == "22:30"` and `wake_time == "06:30"`.
  - `suggest("65_plus", None, [], "05:00")` has `bedtime == "21:30"`.
  - `suggest("under_18", None, [], "07:00")` has `bedtime == "22:00"`.
  - `time_minus_hours("01:00", 8) == "17:00"` and `time_minus_hours("06:30", 7.5) == "23:00"`.
  - Shift worker: `suggest(None, "shift_worker", [], "06:30")` has `bedtime is None` and `notes == [SHIFT_NOTE]`.
  - `suggest(None, None, ["nicotine", "alcohol"], None)["tips"] == [HABIT_TIPS["alcohol"], HABIT_TIPS["nicotine"]]`. Tips come out in `HABIT_TIPS` order, not the order they were ticked.
  - API: an empty body `{}` gives 200 and hours 8. `{"age": "40"}` gives 422. `{"habits": ["coffee"]}` gives 422. `{"wake_time": "6am"}` gives 422. A GET of the settings afterwards is unchanged (nothing saved).
- [ ] **Step 2: Run** the two test files. Expect FAIL.
- [ ] **Step 3: Implement** the constants, `time_minus_hours`, `suggest`, the route and the `api.js` export.
- [ ] **Step 4: Run** the full suite. Expect PASS.
- [ ] **Step 5: Checkpoint.**

### Task 4: Bedtime line in the brief

**Files:**
- Modify: `server/app/sleep.py`, `server/app/brief.py` (`build_brief`), `web/js/render.js` (`renderBrief`, line 45)
- Test: `server/tests/test_sleep.py`, `server/tests/test_brief.py`, `web/tests/render.test.js`

**Interfaces:**
- Consumes: `Settings.sleep_schedule` (Task 2) and Day `bedtime` (Task 1).
- Produces:
  - In `sleep.py`: `minutes_late(actual: str, planned: str) -> int` returns a signed number in `[-720, 719]`. `LATE_GRACE_MINUTES = 30`.
  - In `brief.py`: `bedtime_line(window: list[dict], planned: str) -> tuple[str, dict] | None` and `MIN_BEDTIME_NIGHTS = 4`. The fact shape is `{"area_id": "sleep", "kind": "bedtime", "value": late_nights, "nights": logged_nights, "bedtime": planned}`.
  - Sentence copy:
    - `f"In bed after {planned} on {late} of {n} nights."`
    - `f"In bed by {planned} on all {n} nights."` when `late == 0`.

- [ ] **Step 1: Write failing tests:**
  - `minutes_late("00:15", "23:30") == 45`, `minutes_late("23:00", "23:30") == -30`, `minutes_late("23:50", "00:30") == -40`, `minutes_late("22:30", "22:30") == 0` (Review Focus 5).
  - In `test_brief.py` (use the `week()` helper with `bedtime=[...]`, `wake_time=[...]`):
    - `test_bedtime_line_counts_late_nights`: planned 22:30, bedtimes `["22:30", "23:15", None, "22:50", "23:05", "22:40", "00:10"]` give `"In bed after 22:30 on 3 of 6 nights."` (23:15, 23:05 and 00:10 are late; 22:50 is within the grace).
    - `test_bedtime_line_all_on_time` gives the "by ... on all" copy.
    - `test_no_bedtime_line_under_four_nights`.
    - `test_no_bedtime_line_without_schedule`.
    - `test_bedtime_line_replaces_pattern_when_sleep_is_focus`: sleep is furthest behind, so `sentences[1]` is the line and there's no `"date"` fact.
    - `test_bedtime_line_after_action_when_other_area_is_focus`: `sentences[3]` is the line.
    - `test_brief_never_exceeds_four_sentences`: the low-sleep warning and a non-sleep focus mean the schedule line is dropped and `LOW_SLEEP_LINE` stays.
    - The line's fact is in `facts` with `kind == "bedtime"`.
  - `render.test.js`: `renderBrief({sentences: ["x"], facts: [{area_id: "sleep", kind: "bedtime", value: 3, nights: 6, bedtime: "22:30"}]})` includes `"in bed late on 3 of 6 nights (bedtime 22:30)"`.
- [ ] **Step 2: Run** the Python and JS tests. Expect FAIL.
- [ ] **Step 3: Implement** `minutes_late` (difference mod 1440, then subtract 1440 when it's 720 or more) and `bedtime_line`. A night is "late" when `minutes_late > LATE_GRACE_MINUTES`. In `build_brief`, only when `settings.sleep_schedule` is set and `"sleep" in settings.modules`:
  - If Sleep is the focus area, the line replaces `second`, and the pattern fact isn't added.
  - Otherwise it's inserted after `area.suggestion`.
  - Add the low-sleep line last, then cut the list to 4. If 5 sentences come up, drop the schedule line rather than the low-sleep line, and drop its fact too.

  In `renderBrief`, a `kind === "bedtime"` fact renders as `Sleep: in bed late on {value} of {nights} nights (bedtime {bedtime})`, escaped.
- [ ] **Step 4: Run** both suites. Expect PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Sleep renderers and the target-row id fix

**Files:**
- Modify: `web/js/render.js`
- Test: `web/tests/render.test.js`

**Interfaces:**
- Produces (exports from `render.js`):
  - `renderTargetRows(areas, settings, { prefix = "target", skip = [] } = {})`: input ids become `${prefix}-${id}`, and areas in `skip` are left out. With no options it behaves as now.
  - `gapText(bedtime, wakeTime) -> string`: `"= 8 h a night"`, or `""` when either time is blank or they're equal. It uses the same rule as `hours_between` and is for display only, since the server stays the source of truth.
  - `renderSleepChoice(settings, prefix, withHelp) -> string`:
    - A `<fieldset class="sleep-choice">` with the legend copy, plus radios `name="sleep-mode"` with values `goal`, `schedule`, and `help` (only when `withHelp`). Radio ids are `${prefix}-sleep-mode-${value}`.
    - `<div class="sleep-panel" data-mode="goal">` holds a labelled number input `name="sleep-hours"`, id `${prefix}-sleep-hours`, min 0, max 24, step 0.25. Its value is the sleep target from `settings.targets`, or blank.
    - `<div class="sleep-panel sleep-times" data-mode="schedule">` holds labelled time inputs `name="sleep-bed"` / `name="sleep-wake"` (ids `${prefix}-sleep-bed` / `${prefix}-sleep-wake`) and `<output class="sleep-gap">` with `gapText` filled in.
    - The selected mode is `schedule` when `settings.sleep_schedule` is set, otherwise `goal`. Panels for the other modes get `hidden`.
  - `renderSleepSuggestion(s) -> string`:
    - When `s.bedtime` is set, it shows a `.sleep-times` block with labelled time inputs `name="sugg-bed"` (id `onb-sugg-bed`) and `name="sugg-wake"` (id `onb-sugg-wake`) and an `output.sleep-gap`.
    - Otherwise it shows a labelled number input `name="sugg-hours"` (id `onb-sugg-hours`).
    - Then `<p>Most people your age need {range}.</p>`, then a `<ul class="sleep-tips">` of tips (omitted when empty), then each note as `<p class="sleep-note">`, then `<p class="hint">General guidance, not medical advice.</p>`.
    - Everything goes through `escapeHtml`.

- [ ] **Step 1: Write failing tests:**
  - `renderTargetRows(AREAS, s, {prefix: "onb-target", skip: ["sleep"]})` contains `id="onb-target-spending"` and no `sleep`. The default call still contains `id="target-sleep"`.
  - `gapText("22:30", "06:30") === "= 8 h a night"`, `gapText("23:00", "06:30") === "= 7.5 h a night"`, `gapText("", "06:30") === ""`, `gapText("22:00", "22:00") === ""`.
  - `renderSleepChoice({targets: [{area_id: "sleep", target: 7.5, mode: "up"}], sleep_schedule: null}, "onb", true)` has 3 radios, the `goal` radio checked, `value="7.5"`, and the schedule panel `hidden`.
  - With a `sleep_schedule`, the `schedule` radio is checked and the gap output shows `= 8 h a night`. With `withHelp` false there's no `value="help"`.
  - Every `<input` in the output has a matching `<label for=` (check the id list against the label-for list).
  - `renderSleepSuggestion({hours: 8, range: "7-9 h", bedtime: "22:30", wake_time: "06:30", tips: [EVIL], notes: []})` has `onb-sugg-bed`, no raw `<script`, and the disclaimer copy. Without a bedtime it has `onb-sugg-hours` and no `onb-sugg-bed`.
- [ ] **Step 2: Run** `node --test "web/tests/*.test.js"`. Expect FAIL.
- [ ] **Step 3: Implement** the four exports.
- [ ] **Step 4: Run** the JS tests. Expect PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: Onboarding Sleep step (HTML, CSS, app.js)

**Files:**
- Modify: `web/index.html` (onboarding, lines 35-140), `web/styles.css` (onboarding block, about lines 269-310), `web/js/app.js` (onboarding section, lines 91-237)

**Interfaces:**
- Consumes: `renderSleepChoice`, `renderSleepSuggestion`, `gapText`, `renderTargetRows` options (Task 5), `api.getSleepSuggestion` (Task 3), and the `sleep_schedule` settings (Task 2).
- Produces (in `app.js`, reused in Task 7):
  - `onboardingSteps() -> string[]`.
  - `readSleepChoice(form) -> { schedule: {bedtime, wake_time} | null, hours: number | null, error: string }`.
  - `withSleepChoice(settings, choice) -> settings`. A schedule sets `sleep_schedule`. A goal sets `sleep_schedule: null` and the sleep target `{area_id: "sleep", target: hours, mode: "up"}`.
  - `mergeTargets(oldTargets, newTargets) -> targets`: keeps the old targets whose `area_id` isn't in the new list (Review Focus 1).
  - `showSleepPanels(form, mode)`.
  - A delegated `input` listener that refreshes the `output.sleep-gap` inside the nearest `.sleep-times` with `gapText`.

- [ ] **Step 1: HTML.** Add `#onboarding-step-sleep` between the modules step and the targets step, in the same pattern as the other steps:
  - `p.step-label`, `h2#onb-heading-sleep tabindex="-1"` with the text "Sleep", and `p.lead` with "This sets how Compass judges your sleep each week."
  - `form#onboarding-sleep-form.panel novalidate`, containing:
    - `div#onboarding-sleep-choice`.
    - `div#onboarding-sleep-help.sleep-panel[data-mode=help] hidden`, holding the hint copy and these fields:
      - `select#onb-sleep-age`, with options `""` Skip, `under_18` Under 18, `18_25` 18-25, `26_64` 26-64, `65_plus` 65+.
      - `select#onb-sleep-role`, with options Skip, Student, Employed, Self-employed, Shift worker, Unemployed, Other.
      - A `fieldset.sleep-habits` with legend "Habits that affect sleep" and six labelled checkboxes `name="sleep-habit"`: Alcohol, Caffeine after midday, Screens in bed, Long or late naps, Heavy meals late, Nicotine.
      - `input#onb-sleep-earliest type="time"`, labelled "Earliest weekday wake time".
      - `button#onboarding-sleep-suggest type="button"` with the text "Show my suggestion".
    - `div#onboarding-sleep-suggestion aria-live="polite"`.
    - `p.form-error#onboarding-sleep-error role="alert" hidden`.
    - `.form-actions` with Back (`data-back`) and Next (submit).

  Swap `renderTargetRows` for the prefixed version in the targets step. The text of the existing step labels doesn't matter, because JS rewrites it.
- [ ] **Step 2: CSS** (reuse the tokens; add nothing new):
  - `.sleep-choice` (no fieldset border, same spacing as `.goal-rows`), `.sleep-choice` radios as stacked rows.
  - `.sleep-panel` indented under its radio.
  - `.sleep-times` as a row of label and input pairs that wraps at 360 px.
  - `.sleep-gap` in the muted text colour.
  - `.sleep-habits` as a 2-column checkbox grid, 1 column under 480 px.
  - `.sleep-tips` list spacing, and `.sleep-note` in the accent colour.
- [ ] **Step 3: app.js.**
  - Replace `ONBOARDING_STEPS` with `ALL_STEPS = ["welcome", "modules", "sleep", "targets", "habits", "goals"]` and `onboardingSteps()`. That returns welcome and modules, then `sleep` if Sleep is picked, then `targets` if any other module is picked or none are saved yet, then habits and goals.
  - `showOnboardingStep` hides every step in `ALL_STEPS` and writes `Step X of N` into the visible step's `.step-label`.
  - Areas submit goes to `onboardingSteps()[2]`, drawing it first. Back uses `onboardingSteps()`.
  - `drawOnboardingSleep()` renders the choice with `prefix "onb"`, `withHelp` true. It also clears the suggestion and the error, and resets the help fields.
  - A radio `change` calls `showSleepPanels`.
  - "Show my suggestion" collects the answers. A blank select or time is left out, and the habits are the ticked values. It calls `api.getSleepSuggestion`, then renders into `#onboarding-sleep-suggestion` and focuses its first input. Errors go to `#onboarding-sleep-error`.
  - Sleep submit runs `readSleepChoice`. On an error it shows the error. Otherwise it saves `api.putSettings(withSleepChoice(settings, choice))`, then goes to the next step in `onboardingSteps()`.
  - `readSleepChoice` error copy:
    - "Sleep hours must be a number above 0 and up to 24."
    - "Fill in both times, and make them different."
    - "Press \"Show my suggestion\" first."
  - The targets submit uses `mergeTargets(settings.targets, targets)`.
- [ ] **Step 4: Verify.** Start the scratch server (see Task 8, step 1). In the browser script or by hand, check each path:
  - Pick Sleep and Study, then go through goal, then schedule, then help, then Next. `GET /api/settings` shows the expected `sleep_schedule` and sleep target, and the study target is kept.
  - Pick only Study: there's no Sleep step, and the steps read "of 5".
  - Pick only Sleep: there's no Targets step.
- [ ] **Step 5: Run** both test suites again (no regressions). **Checkpoint.**

### Task 7: Daily log times and the Settings sleep row

**Files:**
- Modify: `web/index.html` (log form lines 164-210, the Settings targets section lines 266-276), `web/styles.css`, `web/js/app.js` (`fillLogForm`, the log submit, `drawSettings`, the `targets-form` submit)

**Interfaces:**
- Consumes: `readSleepChoice`, `withSleepChoice`, `mergeTargets`, `showSleepPanels` (Task 6), and `renderSleepChoice` (Task 5).

- [ ] **Step 1: HTML.**
  - Add `data-sleep="goal"` to the existing sleep hours field.
  - After it, add `<fieldset class="field field-times" data-area="sleep" data-sleep="schedule" hidden>` with legend "Last night", containing a `.sleep-times` with labelled inputs `#log-bedtime` (`name="bedtime"`, `type="time"`, label "In bed") and `#log-wake_time` (`name="wake_time"`, label "Up").
  - In Settings, add `<div id="settings-sleep"></div>` inside `#targets-form`, before `#settings-targets`.
- [ ] **Step 2: CSS.** `.field-times` takes the same grid cell as the other fields, without a fieldset border, and its legend is styled like the field labels.
- [ ] **Step 3: app.js.**
  - `fillLogForm`: a field is hidden when its area isn't enabled, or when it has `data-sleep` and `(data-sleep === "schedule") !== Boolean(settings.sleep_schedule)`. It fills every input in the field, with `""` standing for null.
  - Log submit: loop over every input of each visible field. Time inputs send `value || null`, and number inputs keep the current rule.
    - In schedule mode, also send `sleep_hours: null` (Review Focus 3).
    - In goal mode with sleep enabled, also send `bedtime: null, wake_time: null` (Review Focus 2).
  - `drawSettings`: when Sleep is enabled, `#settings-sleep` gets `renderSleepChoice(settings, "set", false)`, and `""` otherwise. The targets use `{prefix: "target", skip: ["sleep"]}`.
  - Targets submit: when `#settings-sleep` has a choice, run `readSleepChoice` (an error goes to `#targets-error`). Then save with `saveSettings(withSleepChoice({...settings, targets: mergeTargets(settings.targets, targets)}, choice))`.
  - The radio `change` listener from Task 6 also covers `#settings-view`.
- [ ] **Step 4: Verify** on the scratch server:
  - A schedule user sees the "Last night" times. Saving 23:00/06:30 makes the card read 7.5 h.
  - A goal user sees hours.
  - Switching from schedule to goal in Settings, then saving 6 h on the same day, gives a card value of 6.
  - Saving the Settings targets keeps the sleep target.
- [ ] **Step 5: Run** both test suites. **Checkpoint.**

### Task 8: Browser QA script and docs

**Files:**
- Create: `<scratchpad>/qa/onboarding-qa.mjs` (outside the repo)
- Modify: `docs/qa-checklist.md`, `README.md` (line 32 and the status table), `2026-10-21-compass-v1-sdp.md` (line 133, plus a dated note at line 205), `FEATURES.md` (line 33)

- [ ] **Step 1: Scratch server.** From an empty `<scratchpad>/qa/run` folder, run `<Compass>/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir <Compass>/server --host 127.0.0.1 --port 8766` in the background. Note the modified time of `Compass/compass.db` before you start.
- [ ] **Step 2: Write the script.** It drives headless Edge over CDP, using the `cdp.mjs` launcher pattern: `msedge.exe --headless=new --remote-debugging-port`, with Node's `fetch` and `WebSocket`. Each scenario starts with an in-page `fetch("/api/data", {method: "DELETE", headers: {"X-Confirm": "delete-all"}})` and a reload, and prints PASS or FAIL with the reason.
  1. A fresh start has 5 steps labelled 1 of 5 to 5 of 5.
  2. Sleep plus Study: the labels go up to "of 6".
  3. Sleep goal 8: the card target is 8.
  4. Sleep schedule 22:30/06:30: the target is 8, `sleep_schedule` is saved, and the log shows the times.
  5. Help with everything answered (18-25, Student, Alcohol, 06:30): the suggestion is 22:30/06:30 with the alcohol tip, and Next saves the schedule.
  6. Help with everything skipped: the suggestion is 8 h with the hours input, and Next saves a goal.
  7. Help as a shift worker: there are no times, and the note shows.
  8. Next in help mode before pressing suggest shows the error.
  9. Only Sleep picked: there's no Targets step.
  10. Targets: 0 is rejected. A changed study target shows on the card, and the sleep target is kept (Review Focus 1).
  11. Habits: add 2, remove 1, and 1 shows in the grid. Skip leaves none.
  12. Goals: a blank row is ignored, and Skip finishes with no goals.
  13. Resume: reload on step 3 lands on Welcome, and the areas, Sleep and targets are prefilled.
  14. Back on every step keeps the choices.
  15. Focus is on `#onb-heading-<step>` after every step change, and every input in the onboarding view has `labels.length > 0`.
  16. Settings after onboarding: modules re-save, schedule-to-goal switch, Home shows the dashboard. The Settings target labels point at the Settings inputs.
  17. Brief: PUT 5 days with bedtimes through the API, and the bedtime line plus its fact show.
  18. Only `127.0.0.1` requests, and no console errors.
  19. Screenshots of each onboarding step at 1280 and 360 px, with `scrollWidth <= innerWidth` at 360.
- [ ] **Step 3: Run** `node <scratchpad>/qa/onboarding-qa.mjs`. Expect every scenario to PASS. Look at the screenshots. Fix any failure in the task that owns it and rerun.
- [ ] **Step 4: Docs.**
  - `qa-checklist.md`: tick the 8 onboarding items, and add Sleep items (paths, log times, brief line, Settings switch), marked "(browser script)". Add one unticked "Narrator: Sleep step" item for the user, and add 2026-10-29 to the date note.
  - README line 32: "Welcome, areas, a Sleep page (goal, schedule or help working one out), targets, optional habits and goals". Also add `POST /api/sleep/suggestion` to the API table.
  - SDP line 133: "enable modules, set default targets (onboarding is finished by `PUT /api/settings` with `onboarded: true`)". Add a note at line 205 dated 2026-10-28 saying that `apply_onboarding` no longer sets `onboarded`.
  - FEATURES line 33: "Onboarding screen (5-6 steps, Sleep page)".
- [ ] **Step 5: Stop the scratch server.** Confirm the modified time of `Compass/compass.db` hasn't changed. Run both suites one last time. **Final checkpoint:** files changed, test counts, script results, screenshot paths, and the Narrator check left for the user.

### After the plan: walkthrough
Explain the code in build order (Tasks 1-7): what each piece does, why it's built that way, and the steps to rebuild it from scratch. Offer to save it as a file outside the public repo.

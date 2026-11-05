# Study Onboarding Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Study its own onboarding page (1-5 study goals, each a name and an optional date, plus hours a week), then show the nearest goal's countdown on the Study card and in the brief.

**Architecture:** The Python server owns every rule. A new `server/app/study.py` covers days left, the nearest goal, and the card and brief wording. `models.py` stores `study_goals` on Settings, `dashboard.py` adds a `goal` field to the Study card, and `brief.py` adds the study line and a new order for the last sentence slot. The page only shows what the API returns. `render.js` gets pure renderers, and `app.js` wires the new step. Nothing changes in Day, logging, Settings or the importer.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, pytest; vanilla HTML/CSS/JS ES modules, `node:test`; headless Edge over CDP for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-03-study-onboarding-design.md`

## Global Constraints
- Python runs from `.venv`: `.venv/Scripts/python.exe -m pytest server/tests -q`. JS tests: `node --test "web/tests/*.test.js"`. The baseline before Task 1 is 297 Python and 25 JS tests passing.
- A blank entry is a gap (`None`/`null`), never 0. A blank date means "no date".
- Dates are `"YYYY-MM-DD"` and must pass `check_date_key` (`server/app/models.py:65`).
- "Today" always comes from the caller (the dashboard's `today`). `study.py` never calls `date.today()`.
- Errors leave the server as `{"error": {"code", "message"}}`, with pydantic and `ValueError` problems as 422 `invalid` (`server/app/main.py:24-35`).
- All user text goes through `escapeHtml`. Every input has a `<label>`. Focus moves to `#onb-heading-<step>` on each step change.
- Dark theme only. Use the existing tokens and classes, keep contrast at 4.5:1 or above, and don't let the page scroll sideways at 360 px.
- HTML and CSS only get comments where something really needs explaining. JS comments match `app.js`: short, plain lines above each block.
- Limits: `MAX_STUDY_GOALS = 5`, `PASSED_GRACE_DAYS = 7`, hours a week above 0 and up to 168, goal name 1-100 characters (the existing `Name` type).
- Exact copy:
  - legend: "What are you studying for?"
  - row labels: "Goal N", and "Date" (with a visually hidden " for goal N")
  - buttons: "+ Add another", "Remove"
  - hints: "Leave the date blank if there isn't one." and "Up to 5 goals."
  - hours label: "Hours a week for all your studying"
  - errors: "Tell Compass what you're studying for.", "Give each goal a name, or remove it.", "Hours a week must be between 0 and 168."
  - when: "today", "tomorrow", "in N days", "date passed"
  - card line: "{name} · {when}", or just "{name}" for a goal with no date
  - brief: "{name} is {when}." (upcoming) and "The date for {name} has passed."
- **No git.** Each task ends with a checkpoint: list the files changed and the test results to the user. The user commits.

## Review Focus
1. **Existing users with Study turned on and no goals.** `GET /api/dashboard`, the brief, `PUT /api/settings` and Settings > "Save targets" all work, with no Study card line and no study sentence. Pinned in Task 1 (PUT with no goals), Task 3 (dashboard `goal is None`, brief unchanged) and Task 6 (browser).
2. **Odd dates from direct API calls or backups.** `""` becomes `null`. `"2026-02-30"`, `"12/12/2026"`, `20261212` and `"2026-1-5"` are rejected with 422. The browser's date input always sends `"YYYY-MM-DD"` or `""`. Pinned in Task 1.
3. **A name that's only spaces.** On the page, a row with a date and a name of `"   "` gets "Give each goal a name, or remove it." On the server, `StudyGoal(name="   ")` is rejected. Pinned in Task 1 and Task 6.
4. **Goal names containing HTML.** These are escaped in the rows, the card line, the card's `aria-label` and the brief facts. Pinned in Task 4 with `EVIL`/`IMG`.
5. **Two goals with the same date, and the `?date=` dashboard parameter.** The one listed first wins. Days left counts from the dashboard's date, not the computer clock. Pinned in Task 2 (tie) and Task 3 (`?date=` gives a different `days_left`).

---

### Task 1: Study goals in Settings

**Files:**
- Modify: `server/app/models.py` (add `StudyGoal` after `SleepSchedule`, line 133; add the field to `Settings`, line 154)
- Test: `server/tests/test_models.py`, `server/tests/test_api.py`, `server/tests/test_db.py`

**Interfaces:**
- Produces:
  - `class StudyGoal(BaseModel)` with `name: Name` and `date: str | None = None`. A `mode="before"` validator on `date` turns `None`/`""` into `None`. Any other `str` goes through `check_date_key`. Anything else raises `ValueError("Dates must look like YYYY-MM-DD.")`.
  - `Settings.study_goals: Annotated[list[StudyGoal], Field(max_length=MAX_STUDY_GOALS)] = []`, with `MAX_STUDY_GOALS = 5` in `models.py`.

- [ ] **Step 1: Write failing tests.**

  In `test_models.py`:
  - `test_study_goal_blank_date_is_none`: `StudyGoal(name="Exam", date="").date is None`, and the same with `date=None` and with `date` left out.
  - `test_study_goal_keeps_real_date`: `StudyGoal(name="Exam", date="2026-12-12").date == "2026-12-12"`.
  - `test_study_goal_bad_dates_rejected`: each of `["2026-02-30", "12/12/2026", "2026-1-5", 20261212]` raises `ValidationError`.
  - `test_study_goal_blank_name_rejected`: `StudyGoal(name="   ")` raises `ValidationError`.
  - `test_settings_allow_five_study_goals_not_six`: 5 goals validate. 6 raise `ValidationError`.

  In `test_api.py`:
  - `test_put_settings_with_study_goals_round_trips`: `onboard(client)`, then PUT settings with `study_goals: [{"name": "Data Structures exam", "date": "2026-12-12"}, {"name": "Linear Algebra", "date": ""}]`. GET returns them with the second `date` as `None`.
  - `test_put_settings_with_study_and_no_goals_is_accepted`: `onboard(client)` (Study is in the default modules), then PUT `{..., "study_goals": []}` returns 200.
  - `test_put_settings_with_bad_study_date_is_rejected`: `assert_error(r, 422)` for `date: "2026-02-30"`.

  In `test_db.py`:
  - `test_old_backup_without_study_goals_imports`: import a schema-1 backup whose settings have no `study_goals`. `get_settings().study_goals == []`.
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_models.py server/tests/test_api.py server/tests/test_db.py -q`. Expect the new tests to FAIL, because `StudyGoal` doesn't exist and the field is missing.
- [ ] **Step 3: Implement** `StudyGoal`, `MAX_STUDY_GOALS` and `Settings.study_goals` in `models.py`. `check_settings`, `upgrade_settings` and `_validate_backup` need no change, because the field is optional and validated by `Settings`.
- [ ] **Step 4: Run** the full suite `.venv/Scripts/python.exe -m pytest server/tests -q`. Expect everything to PASS.
- [ ] **Step 5: Checkpoint** (no git). Report the files changed and the test count.

### Task 2: Study rules (`study.py`)

**Files:**
- Create: `server/app/study.py`
- Test: `server/tests/test_study.py` (new)

**Interfaces:**
- Consumes: `StudyGoal` (Task 1).
- Produces, in `app.study` (imports `date` and `app.models.StudyGoal` only):
  - `PASSED_GRACE_DAYS = 7`
  - `days_left(date_key: str, today: str) -> int`: whole days. Today is 0, tomorrow is 1, yesterday is -1.
  - `when_text(days: int) -> str`: 0 gives "today", 1 gives "tomorrow", 2 or more gives "in N days", and below 0 gives "date passed".
  - `nearest_goal(goals: list[StudyGoal], today: str) -> StudyGoal | None`: the dated goal with the smallest `days_left >= 0` (first in list order on a tie). If there's none, the dated goal with the largest `days_left` in `-PASSED_GRACE_DAYS..-1`. Otherwise `None`.
  - `card_goal(goals: list[StudyGoal], today: str) -> dict | None`:
    - For `nearest_goal`, it returns `{"name", "date", "days_left", "text": f"{name} · {when_text(days_left)}"}`.
    - If `nearest_goal` is `None`, it uses the first goal with no date: `{"name", "date": None, "days_left": None, "text": name}`.
    - Otherwise `None`.
  - `study_line(goals: list[StudyGoal], today: str) -> tuple[str, dict, bool] | None`: `(sentence, fact, upcoming)` for `nearest_goal`, or `None`.
    - Upcoming sentence: `f"{name} is {when_text(d)}."`. Passed sentence: `f"The date for {name} has passed."`.
    - Fact: `{"area_id": "study", "kind": "deadline", "name", "date", "days_left"}`.

- [ ] **Step 1: Write failing tests** in `test_study.py`, with `TODAY = "2026-11-03"` and `g(name, date=None)` building a `StudyGoal`:
  - `days_left("2026-11-03", TODAY) == 0`, `days_left("2026-11-04", TODAY) == 1`, `days_left("2026-11-15", TODAY) == 12`, `days_left("2026-11-02", TODAY) == -1`, and across a month end `days_left("2026-12-01", "2026-11-30") == 1`.
  - `when_text(0) == "today"`, `when_text(1) == "tomorrow"`, `when_text(12) == "in 12 days"`, `when_text(-3) == "date passed"`.
  - nearest goal:
    - Upcoming beats passed: `[g("Old", "2026-11-01"), g("New", "2026-11-20")]` gives "New".
    - The closest upcoming goal wins: `[g("B", "2026-12-01"), g("A", "2026-11-10")]` gives "A".
    - On a tie, the first in the list wins: `[g("First", "2026-11-10"), g("Second", "2026-11-10")]` gives "First" (Review Focus 5).
    - When all have passed, the latest one within 7 days wins: `[g("X", "2026-10-30"), g("Y", "2026-11-01")]` gives "Y".
    - `[g("Gone", "2026-10-27")]` (7 days past) gives "Gone". `[g("Gone", "2026-10-26")]` (8 days past) gives `None`.
    - `[g("Undated")]` gives `None`, and `[]` gives `None`.
  - card goal:
    - `card_goal([g("Data Structures exam", "2026-11-15")], TODAY)["text"] == "Data Structures exam · in 12 days"`.
    - The passed case's text ends with "· date passed".
    - `card_goal([g("Linear Algebra")], TODAY) == {"name": "Linear Algebra", "date": None, "days_left": None, "text": "Linear Algebra"}`.
    - `card_goal([g("Gone", "2026-10-01"), g("Undated")], TODAY)["text"] == "Undated"`.
    - `card_goal([g("Gone", "2026-10-01")], TODAY) is None`.
  - study line:
    - Upcoming gives `("Data Structures exam is in 12 days.", {...kind "deadline", days_left 12}, True)`.
    - Today gives "... is today.", and tomorrow gives "... is tomorrow.".
    - Passed gives `("The date for Old has passed.", {...days_left -2}, False)`.
    - With no dated goals it gives `None`.
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_study.py -q`. Expect it to FAIL, because `app.study` is missing.
- [ ] **Step 3: Implement** `study.py` with the signatures above, using `date.fromisoformat` for `days_left`.
- [ ] **Step 4: Run** the full suite. Expect everything to PASS.
- [ ] **Step 5: Checkpoint.**

### Task 3: Study card goal and brief line

**Files:**
- Modify: `server/app/dashboard.py` (`build_dashboard`, the `areas.append` at line 28), `server/app/brief.py` (`build_brief`, from the `bedtime = None` at line 89 to the end)
- Test: `server/tests/test_brief.py`, `server/tests/test_api.py`

**Interfaces:**
- Consumes: `card_goal`, `study_line` (Task 2), `Settings.study_goals` (Task 1).
- Produces: each Study entry in `GET /api/dashboard` `areas` has `"goal": dict | None`, shaped like `card_goal`'s result. Other areas have no `goal` key. Brief facts can include `{"area_id": "study", "kind": "deadline", "name", "date", "days_left"}`.

- [ ] **Step 1: Write failing tests.**

  In `test_brief.py`, add a helper `with_goals(s, *goals)` that returns `s.model_copy(update={"study_goals": [StudyGoal(...)...]})`. `TODAY` is `"2026-10-21"`.
  - `test_study_line_replaces_pattern_when_study_is_focus`:
    - Setup: `settings("study")` with a goal on `"2026-11-02"`, and `study_hours=[1]*7`, which is behind 12.
    - The sentences are `[first, "Exam is in 12 days.", study suggestion]`.
    - There's no "Lowest was" sentence, and the facts include the deadline fact.
  - `test_upcoming_study_line_beats_bedtime_line`:
    - Setup: Sleep with a schedule and 4+ bedtimes logged (furthest behind), Study with an upcoming goal, and work on track.
    - The 4th sentence is the study line, and the bedtime line is absent.
  - `test_bedtime_line_beats_passed_study_line`: the same setup with a goal passed 2 days ago. The 4th sentence is the bedtime line.
  - `test_low_sleep_warning_beats_study_line`:
    - Setup: sleep average under 5, sleep furthest behind, and an upcoming study goal.
    - The 4th sentence is `LOW_SLEEP_LINE`, and the study line is absent.
  - `test_passed_study_line_fills_free_slot`: Work is the focus, there's no schedule, and the goal passed 3 days ago. The 4th sentence is "The date for Exam has passed."
  - `test_no_study_line_without_study_module`: goals are saved but Study isn't in `modules`, so there's no deadline fact.
  - `test_no_study_line_when_nothing_logged`: with an empty week, the sentences are `[FIRST_BRIEF]`.
  - `test_brief_never_over_four_sentences_with_study`: loop over the cases above and check `len(sentences) <= 4`.

  In `test_api.py`:
  - `test_dashboard_study_card_has_goal`: onboard, PUT a study goal on `2026-11-02`. `GET /api/dashboard?date=2026-10-21` gives the Study area `goal["text"] == "Exam · in 12 days"`, and the Sleep area has no `"goal"` key.
  - `test_dashboard_goal_counts_from_date_param`: the same goal with `?date=2026-10-31` gives `days_left == 2` (Review Focus 5).
  - `test_dashboard_study_without_goals`: onboard with no goals. The Study `goal is None`, and the brief has no deadline fact (Review Focus 1).
- [ ] **Step 2: Run** `.venv/Scripts/python.exe -m pytest server/tests/test_brief.py server/tests/test_api.py -q`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement.**
  - `dashboard.py`: when `area.id == "study"`, add `"goal": card_goal(settings.study_goals, today)` to the entry.
  - `brief.py`: `study = study_line(settings.study_goals, today) if "study" in settings.modules else None`.
    - The pattern choice becomes: bedtime when Sleep is the focus (unchanged); otherwise the study line when `area.id == "study"` and `study`, which sets `study = None` after use; otherwise the existing "Lowest was"/"Log more" sentences.
    - Then fill the slots left under `MAX_SENTENCES` from this priority list, skipping empty items:
      1. the low-sleep warning
      2. an upcoming `study`
      3. `bedtime`
      4. a passed `study`
    - Append the chosen lines with the low-sleep warning always last. Add each chosen line's fact. The warning has none.
    - Update the module docstring.
- [ ] **Step 4: Run** the full suite. Expect everything to PASS, including every existing brief test unchanged.
- [ ] **Step 5: Checkpoint.**

### Task 4: Renderers

**Files:**
- Modify: `web/js/render.js` (`renderBrief` facts at line 51, `renderAreaCard` at line 66, a new `renderStudyGoals` after `renderSleepSuggestion`), `web/preview.html` (an example Study card with a goal line, and the Study goal rows)
- Test: `web/tests/render.test.js`

**Interfaces:**
- Consumes: the dashboard `goal` field and the deadline fact (Task 3).
- Produces:
  - `renderStudyGoals(goals: {name: string, date: string|null}[], hours: number|string, prefix: string) -> string`. An empty `goals` array draws one empty row.
    - The output is a `<fieldset class="study-goals">` with the legend "What are you studying for?".
    - Each row is `.study-goal-row` with `data-index`, containing:
      - `<input type="text" name="study-name" id="{prefix}-study-name-{i}" maxlength="100">` with the label "Goal {i+1}"
      - `<input type="date" name="study-date" id="{prefix}-study-date-{i}">` with the label "Date" plus `<span class="visually-hidden"> for goal {i+1}</span>`
      - when there are 2 or more rows, `<button type="button" class="btn btn-small" data-remove-study="{i}">Remove<span class="visually-hidden"> goal {i+1}</span></button>`
    - After the rows comes `<button type="button" class="btn" data-add-study>+ Add another</button>`, or `<p class="hint">Up to 5 goals.</p>` at 5 rows, then the hint "Leave the date blank if there isn't one."
    - After the fieldset, the hours field: the label "Hours a week for all your studying", `id="{prefix}-study-hours"`, `type="number" min="0" max="168" step="any"`, and the unit "h".
  - `renderAreaCard`: when `area.goal`, add `<p class="card-goal">{escaped goal.text}</p>` after `.card-target`, and append `, {goal.text}` to the `aria-label`.
  - `renderBrief`: a fact with `kind === "deadline"` renders as `Study: {name}, {date} ({days_left} days left)`, or `(date passed)` when `days_left < 0`. The whole string is escaped.

- [ ] **Step 1: Write failing tests** in `render.test.js`. Import `renderStudyGoals`.
  - `renderStudyGoals([], 12, "onb")` has 1 `study-goal-row`, no `data-remove-study`, `data-add-study`, `value="12"`, and `id="onb-study-hours"` with a matching `for`.
  - 2 goals give 2 rows, and both have Remove.
  - 5 goals give no `data-add-study`, and the text includes "Up to 5 goals."
  - A goal `{name: EVIL, date: "2026-12-12"}` gives no `<script` in the output, and the output contains `value="2026-12-12"` (Review Focus 4).
  - Every `id="X"` has a matching `for="X"`: use a regex over the output.
  - `renderAreaCard(card({id: "study", goal: {text: "Exam · in 12 days"}}))` includes `card-goal` and the text, and the `aria-label` ends with it. With `goal: {text: IMG}`, there's no `<img`. Without `goal`, there's no `card-goal`.
  - `renderBrief({sentences: ["x"], facts: [{area_id: "study", kind: "deadline", name: EVIL, date: "2026-12-12", days_left: 12}]})` includes "12 days left" and no `<script`. With `days_left: -2` it includes "date passed".
- [ ] **Step 2: Run** `node --test "web/tests/*.test.js"`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement** the three changes in `render.js`. Add a goal line to an example Study card in `preview.html`, and add a 2-row `renderStudyGoals` example in the onboarding section, as static HTML in the same style as the file.
- [ ] **Step 4: Run** both suites. Expect everything to PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: The Study onboarding step

**Files:**
- Modify:
  - `web/index.html`: a new `#onboarding-step-study` after the Sleep step (ends at line 119).
  - `web/styles.css`: `.study-goals`, `.study-goal-row` and `.card-goal`, after the sleep styles (line 410 on).
  - `web/js/app.js`:
    - `ALL_STEPS` (line 95) and `onboardingSteps()` (line 100)
    - `goToStep` (line 147)
    - `showOnboarding` (the error reset list, line 167)
    - `drawOnboardingTargets` (line 138, which skips Study)
    - new Study handlers after the Sleep submit handler (line 233)

**Interfaces:**
- Consumes: `renderStudyGoals` (Task 4), `mergeTargets(oldTargets, newTargets)` (`app.js:358`), `api.putSettings`.
- Produces: these app-internal helpers, not used by later tasks:
  - `drawOnboardingStudy()`
  - `readStudyRows(container) -> {name, date}[]` (trimmed name, `date || null`)
  - `checkStudy(rows, hoursText) -> {goals, hours, error}`

- [ ] **Step 1: Markup.**
  - Copy the Sleep step's structure:
    - `<p class="step-label">`
    - `<h2 id="onb-heading-study" tabindex="-1">Study</h2>`
    - `<p class="lead">Tell Compass what you're working towards. You can add more than one.</p>`
    - `<form id="onboarding-study-form" class="panel" novalidate>`, holding `<div id="onboarding-study"></div>` and `<p class="form-error" id="onboarding-study-error" role="alert" hidden>`, then Back and Next as in the Sleep step.
  - CSS:
    - Rows are a grid: name `1fr`, date `auto`, Remove `auto`. Under 480 px, they stack to one column, with Remove aligned to the start.
    - `.card-goal` uses the existing muted text token and the same size as `.card-target`.
- [ ] **Step 2: Steps.**
  - `ALL_STEPS` becomes `["welcome", "modules", "sleep", "study", "targets", "habits", "goals"]`.
  - `onboardingSteps()` pushes `"study"` when it's picked. It keeps `"targets"` only when nothing is picked or some pick is neither `"sleep"` nor `"study"`.
  - `goToStep("study")` calls `drawOnboardingStudy()`.
  - `drawOnboardingTargets` passes `skip: ["sleep", "study"]`.
  - `showOnboarding` also clears `onboarding-study-error`.
- [ ] **Step 3: Draw and edit rows.**
  - `drawOnboardingStudy()` renders `renderStudyGoals(settings.study_goals, hours, "onb")` into `#onboarding-study`, where `hours` is the saved Study target or the Study area's `default_target` from `areas`. It also clears the error.
  - One click listener on `#onboarding-study` handles both buttons:
    - `[data-add-study]`: read the rows, push `{name: "", date: null}`, re-render with the current hours input value, and focus the last `study-name` input.
    - `[data-remove-study]`: read the rows, remove that index, re-render, and focus `[data-add-study]`.
  - Unsaved typing survives add and remove, because the rows are read from the DOM first.
- [ ] **Step 4: Check and save.** `checkStudy` runs the spec's order:
  1. Drop rows with a blank name and no date.
  2. No rows left gives "Tell Compass what you're studying for."
  3. Any row with a date but a blank name gives "Give each goal a name, or remove it."
  4. Hours that aren't `> 0 && <= 168` give "Hours a week must be between 0 and 168."

  The submit handler then calls `api.putSettings({...settings, study_goals: goals, targets: mergeTargets(settings.targets, [{area_id: "study", target: hours, mode: savedMode || "up"}])})`. Here `savedMode` is the saved Study target's mode. Server errors show in `onboarding-study-error`. On success, `goToStep(nextStep())`.
- [ ] **Step 5: Verify by hand** against a scratch server (Task 6, step 1). Check:
  - Study + Movement gives 6 steps, Study is "Step 3 of 6", and Targets shows only Movement.
  - Study alone has no Targets step.
  - Add up to 5 rows, then remove one.
  - Each of the three errors.
  - Back and resume redraw the saved goals.
  - The card line shows on the dashboard.
- [ ] **Step 6: Run** both suites. **Checkpoint.**

### Task 6: Browser QA script and docs

**Files:**
- Create: `<scratchpad>/qa/study-qa.mjs` (outside the repo). The Sleep-round script was kept in an old session's scratchpad and is gone, so this one is written fresh.
- Modify:
  - `docs/qa-checklist.md`
  - `README.md` (line 32 and the status table near line 187)
  - `FEATURES.md` (line 33)
  - `2026-10-21-compass-v1-sdp.md` (the data model at line 123, plus a dated note)
- Create: `docs/areas/study.md` (the same headings as `docs/areas/sleep.md`)

- [ ] **Step 1: Scratch server.** From an empty `<scratchpad>/qa/run` folder, run `<Compass>/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir <Compass>/server --host 127.0.0.1 --port 8766` in the background. Note the modified time of `Compass/compass.db` before you start.
- [ ] **Step 2: Write the script.** It drives headless Edge over CDP: `msedge.exe --headless=new --remote-debugging-port=<free port> --user-data-dir=<scratchpad>/qa/profile`, with Node's built-in `fetch` and `WebSocket`. Each scenario starts with an in-page `fetch("/api/data", {method: "DELETE", headers: {"X-Confirm": "delete-all"}})` and a reload, and prints PASS or FAIL with the reason. Scenarios:
  1. Step labels: Study alone gives 5 steps with no Targets. Sleep + Study gives 6 with no Targets. Sleep + Study + Movement gives 7, and Targets shows only Movement.
  2. Add rows to 5: the Add button is gone and "Up to 5 goals." shows. Focus is on the new name input after each add. Remove one: focus is on Add, and the typed text in the other rows is kept.
  3. Next with every row blank shows "Tell Compass what you're studying for."
  4. A date with the name `"   "` shows "Give each goal a name, or remove it." (Review Focus 3).
  5. Hours `0` and `200` show "Hours a week must be between 0 and 168."
  6. Saving 2 goals (one dated, one not) and hours 10: `GET /api/settings` has both goals with the undated `date: null`, and the Study target is `{10, "up"}`.
  7. A Study target saved as `limit` beforehand stays `limit` after the Study step.
  8. Back from Targets and a reload, then resume: the Study step redraws the saved goals and hours.
  9. Card lines, set through the API with the dashboard's own date: in 12 days, today, tomorrow, passed 3 days ago ("date passed"), passed 8 days ago (no line), and undated only (name only).
  10. Brief: Study furthest behind with an upcoming goal shows the study sentence and a "days left" fact under "Numbers used".
  11. An existing user with Study on and no goals: the dashboard loads with no card line, and Settings > "Save targets" saves a changed Movement target (Review Focus 1). The saved goals are untouched after "Save targets" when there are some.
  12. Untick Study in Settings > Modules, then tick it again: `study_goals` are still saved.
  13. Sleep regression: the goal path saves 8 h, the schedule path saves 22:30/06:30, and only Sleep picked has no Targets step.
  14. Every input in the onboarding view has `labels.length > 0`. Focus is on `#onb-heading-<step>` after each step change.
  15. Only `127.0.0.1` requests, and no console errors (ignore the browser's own `/favicon.ico` 404, which was already there before this work).
  16. Screenshots of the Study step with 1 and 5 rows, and of the dashboard, at 1280 and 360 px, with `scrollWidth <= innerWidth` at 360.
- [ ] **Step 3: Run** `node <scratchpad>/qa/study-qa.mjs`. Expect every scenario to PASS. Look at the screenshots. Fix any failure in the task that owns it and rerun.
- [ ] **Step 4: Docs.**
  - `qa-checklist.md`: add Study items (step labels, add/remove, the three errors, saving, resume, card lines, brief line, no-goal users, Sleep regression), each marked "(browser script)". Add one unticked "Narrator: Study step (row labels, Add and Remove, focus)" item for the user, and add 2026-11-03 to the date note.
  - README line 32: "Welcome, then pick 1 to 3 of four modules, a Sleep page (a goal, a schedule, or help working one out), a Study page (what you're studying for, dates, hours a week), targets for the rest, optional habits and goals". Add a status row: "Study onboarding page (2026-11-03) | Done; see `docs/superpowers/specs/2026-11-03-study-onboarding-design.md`".
  - FEATURES line 33: "Onboarding screen (5-7 steps, with Sleep and Study pages)".
  - SDP line 123: add `study_goals: [{name, date|null}] (0-5)` to Settings. Add a note dated 2026-11-03 pointing to the spec.
  - `docs/areas/study.md`: how Study works now (field, weekly sum, 12 h default, study goals, card line, brief line, defined in `server/app/areas.py` and `server/app/study.py`), plus empty Notes / Ideas / Questions headings.
- [ ] **Step 5: Stop the scratch server.** Confirm the modified time of `Compass/compass.db` hasn't changed. Run both suites one last time. **Final checkpoint:** files changed, test counts, script results, screenshot paths, and the Narrator check left for the user.

### After the plan: walkthrough
Explain the code in build order: data (Task 1), rules (Task 2), API and brief (Task 3), HTML and CSS (Task 5, step 1), render.js (Task 4), then app.js (Task 5). Cover what each piece does, why it's built that way, and the steps to rebuild it from scratch. Offer to save it as a file outside the public repo.

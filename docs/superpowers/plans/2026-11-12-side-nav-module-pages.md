# Side Nav and Module Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nav (side column on laptops, bottom bar on phones) and one page per module (Sleep, Study, Work) that shows the week, the last 7 days, a log form, the module's details and an in-place Edit form; remove the three module sections from Settings.

**Architecture:** Still one `index.html`. The address after `#` picks the view (`#/`, `#/sleep`, `#/study`, `#/work`, `#/settings`); `app.js` listens for `hashchange`. `GET /api/dashboard` grows three fields (`dates`, and per area `period` and `details`) written by a new `server/app/pages.py`, so a module page is the same request Home already makes. `render.js` gets pure renderers for the nav and the module page; a new `route.js` holds the one pure address rule.

**Tech Stack:** Python 3.12, FastAPI, pytest; plain HTML/CSS; vanilla JS modules; `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-12-side-nav-module-pages-design.md`

## Global Constraints

- **No git at all.** Where a task would say "Commit", stop and report the files changed and the test output instead.
- The Python server owns every rule and all wording of statuses, targets, countdowns and tips. The page only draws what the API returns.
- A blank is a gap, never 0. A gap reads "not logged"; a real 0 reads "0 h".
- Plain HTML/CSS/vanilla JS, existing tokens and classes in `web/styles.css`, dark theme only, contrast 4.5:1 or more. No icons, no CDN, no new packages.
- Every input has a label. Everything works with the keyboard only.
- All user text goes through `escapeHtml` in `render.js`.
- No routine comments in HTML or CSS. JS comments are short and in plain words, as in the existing files.
- Keep each file's existing line endings (the tree is CRLF).
- Nothing saved changes shape: no change to Settings, Day, backups or the schema version.
- Side nav at 800 px and wider; bottom bar under 800 px. No sideways scrolling at 360 px.
- Test commands, run from the repo root:
  - `.venv/Scripts/python.exe -m pytest server/tests -q` (baseline 397 passed)
  - `node --test "web/tests/*.test.js"` (baseline 43 pass)

## Review Focus

1. **A bad or stale address** (`#/study` after Study is switched off, `#/sleep/x`, `#settings`, `#/SLEEP`): shows Home, never a blank page. Pinned by Task 2's `pageFromHash` tests.
2. **A real 0 next to gaps in the 7-day list**: 0 reads "0 h", a gap reads "not logged". Pinned by Task 2's `renderModulePage` test.
3. **HTML typed into a study goal, work role or work goal** shows as text in the details lines. Pinned by Task 2's escaping test.
4. **Saving a module's log wipes the rest of the day** (tasks, note, the other modules' numbers, habits). Expected: only that module's fields change. Pinned by Task 3's browser check (step 9).
5. **Work days that are not one run** (Mon, Wed, Fri) or a single day: the hours line lists them, and only a run of two or more reads "Mon to Fri". Pinned by Task 1's `test_work_days_text`.

---

### Task 1: Server — page details in the dashboard

**Files:**
- Create: `server/app/pages.py`
- Create: `server/tests/test_pages.py`
- Modify: `server/app/dashboard.py`
- Modify: `server/tests/test_api.py` (add tests near the other dashboard tests, around line 537)

**Interfaces:**
- Consumes: `bedtime_line(window, planned)` and `_fmt` from `app.brief`; `days_left`, `when_text` from `app.study`; `week_hours`, `work_tip` from `app.work`; `target_for` from `app.settings_rules`.
- Produces:
  - `pages.PERIODS = {"avg": "average a night", "sum": "this week"}`
  - `pages.work_days_text(days: list[int]) -> str`
  - `pages.module_details(area_id: str, settings: Settings, window: list[dict], today: str) -> dict` returning `{"title": str, "lines": list[str]}`
  - `GET /api/dashboard` response: top-level `"dates": list[str]` (the 7 keys, oldest first); each area entry gains `"period": str` and `"details": {"title", "lines"}`.

- [ ] **Step 1: Write the failing tests in `server/tests/test_pages.py`**

Build settings with the helpers the other test files use (`Settings`, `Target`, `StudyGoal`, `WorkProfile`, `SleepSchedule` from `app.models`). `TODAY = "2026-11-12"`. A window is 7 dicts; only `bedtime` matters here.

```python
def test_sleep_goal():
    # sleep target 7.5, no schedule
    assert module_details("sleep", s, [], TODAY) == {"title": "Your goal", "lines": ["7.5 h a night"]}

def test_sleep_schedule_without_enough_bedtimes():
    # schedule 22:30 / 06:00, 3 logged bedtimes
    assert d == {"title": "Your schedule", "lines": ["In bed 22:30 · Up 06:00"]}

def test_sleep_schedule_with_bedtime_line():
    # bedtimes 22:00, 22:15, 23:30, 23:45, 00:30 (5 nights, 3 late)
    assert d["lines"] == ["In bed 22:30 · Up 06:00", "In bed after 22:30 on 3 of 5 nights."]

def test_study_goals_in_saved_order():
    # goals: Exam 2026-11-24, Essay 2026-10-01, Thesis (no date), Quiz 2026-11-12
    assert d == {"title": "Your goals", "lines": [
        "Exam · in 12 days", "Essay · date passed", "Thesis", "Quiz · today"]}

def test_study_without_goals():
    assert d["lines"] == ["No study goals yet."]

def test_work_full_profile():
    # role "Software developer", goal "Fix 3 bugs", schedule Mon-Fri 09:00-17:00,
    # focus "morning", derailers ["procrastination"], kind "freelance" (mode up)
    assert d == {"title": "Your work", "lines": [
        "Software developer",
        "Goal: Fix 3 bugs",
        "Mon to Fri, 09:00 to 17:00 · 40 h a week",
        "This week's tip: Spend 10 minutes in the morning on the task you've been putting off."]}

def test_work_hours_vary():
    # hours_vary True, work target 25
    assert "Hours vary · 25 h a week" in d["lines"]

def test_work_empty_profile_has_only_the_tip():
    assert d["lines"] == ["This week's tip: Block 30 minutes today for your most urgent task."]

def test_work_limit_mode_gives_the_stop_tip():
    # work target mode "limit"
    assert d["lines"][-1] == "This week's tip: Pick a time to stop work today and keep to it."

@pytest.mark.parametrize("days, text", [
    ([0, 1, 2, 3, 4], "Mon to Fri"),
    ([0, 2, 4], "Mon, Wed, Fri"),
    ([5], "Sat"),
    ([5, 6], "Sat to Sun"),
    ([0, 1, 3], "Mon, Tue, Thu"),
    ([0, 1, 2, 3, 4, 5, 6], "Mon to Sun"),
])
def test_work_days_text(days, text):
    assert work_days_text(days) == text
```

- [ ] **Step 2: Run them and see them fail**

Run: `.venv/Scripts/python.exe -m pytest server/tests/test_pages.py -q`
Expected: collection error, `No module named 'app.pages'`.

- [ ] **Step 3: Write `server/app/pages.py`**

One small function per module plus `module_details`, which picks by `area_id`. Rules the tests don't fully pin:
- Numbers are worded with `brief._fmt` (40, not 40.0).
- Sleep with a schedule uses `settings.sleep_schedule.bedtime` / `.wake_time`; the second line is `bedtime_line(window, bedtime)[0]` when it returns something.
- Study: every goal in saved order; a dated goal is `f"{name} · {when_text(days_left(date, today))}"` (no 7-day grace here: an old date still reads "date passed").
- Work lines, in order, each left out when it has nothing: role; `"Goal: " + goal`; hours; tip. Hours: with a schedule, `f"{work_days_text(days)}, {start} to {end} · {_fmt(week_hours(schedule))} h a week"`; with `hours_vary`, `f"Hours vary · {_fmt(target)} h a week"` using `target_for(settings, "work").target`; otherwise none. The tip is `work_tip(settings.work, mode)` with the saved Work mode.
- `work_days_text`: sorted days; "X to Y" only when they are one unbroken run of two or more; otherwise names joined by ", ".

- [ ] **Step 4: Run them and see them pass**

Run: `.venv/Scripts/python.exe -m pytest server/tests/test_pages.py -q`
Expected: 15 passed.

- [ ] **Step 5: Write the failing dashboard tests in `server/tests/test_api.py`**

```python
def test_dashboard_has_the_seven_dates(client):
    # onboard with sleep; GET /api/dashboard?date=2026-11-12
    assert body["dates"] == ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09",
                             "2026-11-10", "2026-11-11", "2026-11-12"]

def test_dashboard_areas_carry_period_and_details(client):
    # onboard with sleep, study, work
    by_id = {a["id"]: a for a in body["areas"]}
    assert by_id["sleep"]["period"] == "average a night"
    assert by_id["study"]["period"] == "this week"
    assert by_id["work"]["period"] == "this week"
    assert by_id["sleep"]["details"] == {"title": "Your goal", "lines": ["7.5 h a night"]}
    assert by_id["study"]["details"]["lines"] == ["No study goals yet."]
    assert by_id["work"]["details"]["title"] == "Your work"
```

- [ ] **Step 6: Run them and see them fail**

Run: `.venv/Scripts/python.exe -m pytest server/tests/test_api.py -q -k "seven_dates or period_and_details"`
Expected: 2 failed with `KeyError`.

- [ ] **Step 7: Add the fields in `server/app/dashboard.py`**

`"dates": dates` at the top level; in each entry `"period": PERIODS[area.aggregate]` and `"details": module_details(area.id, settings, window, today)`. Mention the new fields in the module docstring.

- [ ] **Step 8: Run the whole server suite**

Run: `.venv/Scripts/python.exe -m pytest server/tests -q`
Expected: 414 passed (397 + 15 + 2).

- [ ] **Step 9: Stop and report** (files changed, test output). No commit.

---

### Task 2: Pure JS — address rule and renderers

**Files:**
- Create: `web/js/route.js`
- Create: `web/tests/route.test.js`
- Modify: `web/js/render.js`
- Modify: `web/tests/render.test.js`

**Interfaces:**
- Consumes: the dashboard fields from Task 1 (`dates`, `period`, `details`, and the existing `id, label, unit, value, target, mode, status, series`).
- Produces:
  - `route.js`: `pageFromHash(hash: string, modules: string[]) -> "home" | "settings" | <module id>` and `hashFor(page: string) -> string` (`"home"` gives `"#/"`, anything else `"#/" + page`).
  - `render.js`:
    - `renderNav(areas, modules, current) -> string` — `areas`: `[{id, label}]`, `current`: a page name from `pageFromHash`.
    - `dayLabel(dateKey, todayKey) -> string` — `"Today"` or `"Fri 6"`.
    - `renderModulePage(area, dates, today, day, settings) -> string` — `area`: one dashboard entry; `day`: today's saved day; `settings`: for `sleep_schedule` and `work.kind`.
    - `renderModuleEdit(areaId, settings, hours) -> string` — `hours`: the saved Study or Work target (ignored for Sleep).
    - `renderAreaCard` — the title becomes a link.
    - `renderTargetRows` — removed.
  - Ids and classes Task 3 and 4 rely on: `nav-link`, `nav-label`, `module-log-form`, `module-log-status`, `module-details`, `module-edit`, `module-edit-form`, `module-edit-error`, `module-edit-cancel`, `module-study`.

- [ ] **Step 1: Write the failing tests in `web/tests/route.test.js`**

```js
const ON = ["sleep", "work"];
test("pageFromHash", () => {
  assert.strictEqual(pageFromHash("", ON), "home");
  assert.strictEqual(pageFromHash("#", ON), "home");
  assert.strictEqual(pageFromHash("#/", ON), "home");
  assert.strictEqual(pageFromHash("#/sleep", ON), "sleep");
  assert.strictEqual(pageFromHash("#/settings", ON), "settings");
  assert.strictEqual(pageFromHash("#/study", ON), "home");      // switched off
  assert.strictEqual(pageFromHash("#/sleep/x", ON), "home");
  assert.strictEqual(pageFromHash("#settings", ON), "home");
  assert.strictEqual(pageFromHash("#/SLEEP", ON), "home");
  assert.strictEqual(pageFromHash("#/toString", ON), "home");
});
test("hashFor", () => {
  assert.strictEqual(hashFor("home"), "#/");
  assert.strictEqual(hashFor("work"), "#/work");
  assert.strictEqual(hashFor("settings"), "#/settings");
});
```

- [ ] **Step 2: Run and see them fail**

Run: `node --test "web/tests/*.test.js"`
Expected: `route.test.js` fails with `Cannot find module`.

- [ ] **Step 3: Write `web/js/route.js`** (two exported functions, a short header comment saying what the file is for).

- [ ] **Step 4: Write the failing renderer tests in `web/tests/render.test.js`**

Remove the `renderTargetRows` import and its tests. Add (with `EVIL = '<img src=x onerror=alert(1)>'` as the file already defines it, and a helper `entry(overrides)` that returns a Sleep dashboard entry: `id "sleep", label "Sleep", unit "h", value 6.8, target 7.5, mode "up", status "Behind", period "average a night", series [7.5, 8, null, 6, 6.5, 0, null], details {title: "Your goal", lines: ["7.5 h a night"]}`; `DATES` = 2026-11-06 … 2026-11-12; `TODAY = "2026-11-12"`):

```js
test("renderNav lists Home, the modules that are on, then Settings", () => {
  const html = renderNav(AREAS, ["work", "sleep"], "sleep");   // AREAS in server order: sleep, study, work
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(hrefs, ["#/", "#/sleep", "#/work", "#/settings"]);
  assert.ok(!html.includes("Study"));
  assert.strictEqual(html.match(/aria-current="page"/g).length, 1);
  assert.match(html, /href="#\/sleep"[^>]*aria-current="page"/);
  assert.ok(html.includes("Modules"));
});

test("renderNav without modules has no Modules label", () => {
  assert.ok(!renderNav(AREAS, [], "home").includes("Modules"));
});

test("dayLabel", () => {
  assert.strictEqual(dayLabel("2026-11-06", "2026-11-12"), "Fri 6");
  assert.strictEqual(dayLabel("2026-11-12", "2026-11-12"), "Today");
  assert.strictEqual(dayLabel("2026-11-12", "2026-11-13"), "Thu 12");
});

test("module page: week panel", () => {
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("6.8"));
  assert.ok(html.includes("Behind"));
  assert.ok(html.includes("average a night · Target 7.5 h"));
});

test("module page: no data", () => {
  const html = renderModulePage(entry({ value: null, status: "No data" }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(html.includes("No data"));
  assert.ok(html.includes("Target 7.5 h"));
});

test("module page: gaps read 'not logged' and a real 0 reads '0 h'", () => {
  const html = renderModulePage(entry(), DATES, TODAY, DAY, SETTINGS);
  assert.strictEqual(html.match(/not logged/g).length, 2);
  assert.ok(html.includes("0 h"));
  assert.ok(html.includes("Fri 6"));
  assert.ok(html.includes("Today"));
  assert.strictEqual(html.match(/<tr/g).length, 8);            // heading row + 7 days
});

test("module page: log fields per module", () => {
  const goal = renderModulePage(entry(), DATES, TODAY, { ...DAY, sleep_hours: 7 }, SETTINGS);
  assert.ok(goal.includes('name="sleep_hours"') && goal.includes('value="7"'));
  assert.ok(goal.includes("Log last night"));
  const sched = renderModulePage(entry(), DATES, TODAY, { ...DAY, bedtime: "23:10", wake_time: "06:40" },
    { ...SETTINGS, sleep_schedule: { bedtime: "22:30", wake_time: "06:00" } });
  assert.ok(sched.includes('name="bedtime"') && sched.includes('name="wake_time"'));
  assert.ok(!sched.includes('name="sleep_hours"'));
  assert.ok(sched.includes("= 7.5 h a night"));
  const work = renderModulePage(entry({ id: "work", label: "Work", period: "this week" }), DATES, TODAY, DAY,
    { ...SETTINGS, work: { ...SETTINGS.work, kind: "job_hunting" } });
  assert.ok(work.includes('name="work_hours"') && work.includes("Job search") && work.includes("Log today"));
});

test("module page: a blank log field stays blank, never 0", () => {
  const html = renderModulePage(entry(), DATES, TODAY, { ...DAY, sleep_hours: null }, SETTINGS);
  assert.match(html, /name="sleep_hours"[^>]*value=""/);
});

test("module page: details lines are escaped and the Edit button names the module", () => {
  const html = renderModulePage(entry({ details: { title: "Your goals", lines: [EVIL] } }), DATES, TODAY, DAY, SETTINGS);
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Your goals"));
  assert.match(html, /id="module-edit"[^>]*>Edit sleep</);
});

test("renderModuleEdit uses each module's form with the mod prefix", () => {
  const sleep = renderModuleEdit("sleep", SETTINGS, null);
  assert.ok(sleep.includes('id="mod-sleep-mode-goal"') && !sleep.includes("Let's work it out"));
  const study = renderModuleEdit("study", { ...SETTINGS, study_goals: [{ name: "Exam", date: null }] }, 12);
  assert.ok(study.includes('id="module-study"') && study.includes('id="mod-study-name-0"') && study.includes('value="12"'));
  const work = renderModuleEdit("work", SETTINGS, 16);
  assert.strictEqual(work.match(/class="work-question"/g).length, 6);
  for (const html of [sleep, study, work]) {
    assert.ok(html.includes('id="module-edit-form"') && html.includes('id="module-edit-error"') && html.includes('id="module-edit-cancel"'));
  }
});

test("area card title links to the module page", () => {
  assert.match(renderAreaCard(card()), /<h3 class="card-title"><a href="#\/sleep">Sleep<\/a><\/h3>/);
});
```

`DAY` is an empty day (`sleep_hours, bedtime, wake_time, study_hours, work_hours` all `null`); `SETTINGS` has `modules`, `targets: []`, `sleep_schedule: null`, `study_goals: []` and an empty `work` profile. Check the existing `card()` helper has `id: "sleep"`; add it if not.

- [ ] **Step 5: Run and see them fail**

Run: `node --test "web/tests/*.test.js"`
Expected: the new render tests fail (`renderNav is not a function` and so on).

- [ ] **Step 6: Implement in `web/js/render.js`**

- Delete `renderTargetRows` and the "Settings screen" comment lines that describe it.
- `renderAreaCard`: wrap the title text in `<a href="#/${escapeHtml(area.id)}">`.
- A new `// --- Nav and module pages ---` section at the end:
  - `renderNav`: `<a class="nav-link" href="...">` links; `aria-current="page"` on the one matching `current`; `<p class="nav-label">Modules</p>` before the module links only when there is at least one; modules in `areas` order; Settings last with the extra class `nav-settings`.
  - `dayLabel`: reuse `DAY_NAMES` and the `new Date(key + "T00:00")` pattern `renderHabitGrid` uses.
  - `renderModulePage` returns four `<section class="panel ...">` blocks in this order: `module-week`, `module-log`, `module-days`, `module-details`. Pinned details:
    - Week: `<h2>This week</h2>`; the value with its unit, or "-" with no unit when there is none; `<span class="status">`; one line `${area.period} · ${targetText(...)}`; `data-status` on the section using `STATUS_KEYS`.
    - Log: `<h2>Log last night</h2>` for Sleep, `<h2>Log today</h2>` otherwise; `<form id="module-log-form" data-area="${id}" novalidate>`; input names exactly as on Home (`sleep_hours`, or `bedtime` + `wake_time` inside a `.sleep-times` wrapper with an `<output class="sleep-gap">`, `study_hours`, `work_hours`) with ids `mod-log-<name>` and the same `type`, `min`, `max`, `step` as Home's log form in `web/index.html`; labels "Sleep", "In bed", "Up", "Study", and "Job search" or "Paid work"; a submit button "Save"; `<p class="save-status" id="module-log-status" role="status" aria-live="polite"></p>`. A null value gives `value=""`.
    - Days: `<h2>Last 7 days</h2>` and `<table class="day-table">` with a visually hidden `<caption>` (`${label}, last 7 days`), a visually hidden heading row ("Day", "Hours"), and one row per date: `<th scope="row">` with `dayLabel`, `<td>` with `withUnit(value, unit)` or `<span class="gap">not logged</span>`.
    - Details: the section has `id="module-details"`; `<h2>` with `details.title`; one `<p>` per line; `<button type="button" class="btn" id="module-edit">Edit ${label in lower case}</button>`.
  - `renderModuleEdit`: `<form id="module-edit-form" data-area="${areaId}" novalidate>` holding, by module: `renderSleepChoice(settings, "mod", false)`; `<div id="module-study">` + `renderStudyGoals(settings.study_goals, hours, "mod")` + `</div>`; or the six `renderWorkQuestion(i, settings.work, hours, "mod")`. Then `<p class="form-error" id="module-edit-error" role="alert" hidden></p>` and a `.form-actions` row with a primary submit "Save" and `<button type="button" class="btn btn-ghost" id="module-edit-cancel">Cancel</button>`.
- Update the file's header comment if it lists what the file holds.

- [ ] **Step 7: Run and see everything pass**

Run: `node --test "web/tests/*.test.js"`
Expected: all pass, 0 fail (43 minus the removed `renderTargetRows` tests, plus 13 new).

- [ ] **Step 8: Stop and report.** `app.js` still imports `renderTargetRows`, so the page is broken in the browser until Task 3; say so.

---

### Task 3: The page — nav, addresses, module page with its log

**Files:**
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/js/app.js`

**Interfaces:**
- Consumes: `pageFromHash`, `hashFor` (Task 2); `renderNav`, `renderModulePage` (Task 2); `api.getDashboard`, `api.getDay`, `api.putDay`.
- Produces (Task 4 relies on these in `app.js`): `showPage()` — reads the address and shows the matching view; `loadModulePage(id)` — fetches and draws a module page; module-level `let modulePage = null` (the id showing, or null); elements `#side-nav`, `#nav-links`, `#module-view`, `#module-title`, `#module-body`.

- [ ] **Step 1: `web/index.html`**

- Remove the two buttons and the `<nav class="site-nav">` from the header. The header keeps `.brand` and `#today-label`.
- Add `<nav class="side-nav" id="side-nav" aria-label="Main" hidden>` holding a copy of the brand line and `<div id="nav-links"></div>`. Place it so that header, nav, banner and `<main>` can be laid out as a two-column shell (wrap them in one `<div class="shell">` if the CSS needs it). The skip link stays first in `<body>`.
- Dashboard `<h1>` and Settings `<h1>` get `tabindex="-1"` (they receive focus on a page change).
- Add, between the dashboard view and the settings view:
  ```html
  <div class="view view-module" id="module-view" hidden>
    <h1 id="module-title" tabindex="-1"></h1>
    <div class="module-grid" id="module-body"></div>
  </div>
  ```
- Settings: delete the `#settings-targets-panel`, `#settings-study-panel` and `#settings-work-panel` sections. Under the Modules form's options add `<p class="hint">Each module has its own page in the menu, where you can change its goal.</p>`.

- [ ] **Step 2: `web/styles.css`**

Left to you: grid or flex, spacing, how the nav stays put. Required results:
- 800 px and wider: `.side-nav` is a left column about 200 px wide, full height, staying in place while the page scrolls; brand at its top; `.nav-settings` at its bottom; the header shows only the date (its brand is hidden).
- Under 800 px: `.side-nav` is a bar fixed to the bottom, links in one row sharing the width equally, text only; its brand and `.nav-label` are hidden; the header shows brand and date; `main` has bottom padding at least the bar's height plus 16 px.
- `.nav-link`: no underline, muted text, at least 44 px tall; `[aria-current="page"]` gets `--accent-soft` background and `--text` colour (plus an accent edge on the laptop column); visible `:focus-visible`.
- `.module-grid`: one column on phones in source order with the log panel second (week, log, days, details); from 800 px two columns as in the spec's sketch: week across the top, days on the left, log and details stacked on the right.
- `.day-table`: full width, rows separated by `--border`, value right-aligned, `.gap` muted and italic.
- `.card-title a`: inherits colour, underlined only on hover and focus.
- Remove rules that only served the deleted markup (`.site-nav`, target rows if nothing else uses them). `[hidden]` already wins over any `display` you set.

- [ ] **Step 3: `web/js/app.js` — remove what is gone**

Remove: the `renderTargetRows` import; the `nav-home` and `nav-settings` listeners; the `targets-form`, `study-form` and `work-form` submit listeners; the `settings-study` click listener and the two `work-form` status listeners; the Sleep, Targets, Study and Work lines in `drawSettings` and their ids in its error list; `OWN_PAGE` if nothing else uses it. Keep `readSleepChoice`, `withSleepChoice`, `readStudyRows`, `checkStudy`, `withStudy`, `readWorkAnswer`, `withWork`, `changeStudyRows`, `studyHours`, `workHours` — onboarding uses them and Task 4 will.

- [ ] **Step 4: `web/js/app.js` — views and addresses**

- `showView(name)` handles `"onboarding" | "dashboard" | "module" | "settings"` and sets `$("side-nav").hidden = name === "onboarding"`. It no longer touches nav buttons.
- `drawNav(current)`: `$("nav-links").innerHTML = renderNav(areas, settings.modules, current)`.
- `async function showPage()`:
  1. If `!settings.onboarded`, return (onboarding ignores the address).
  2. `const page = pageFromHash(location.hash, settings.modules)`. If `location.hash !== hashFor(page)`, fix it with `history.replaceState(null, "", hashFor(page))` (no extra history entry, no second `hashchange`).
  3. `drawNav(page)`; then by page: home → `loadDashboard()`, `showView("dashboard")`; settings → `drawSettings()`, `showView("settings")`; otherwise `loadModulePage(page)`, `showView("module")`. Set `modulePage` to the module id or null.
  4. Move focus to the showing view's `<h1>`.
- `window.addEventListener("hashchange", () => safely(showPage))`.
- `start()`: after loading, `settings.onboarded ? await showPage() : showOnboarding()`.
- `finishOnboarding`: after saving, `history.replaceState(null, "", "#/")` then `await showPage()`.
- Modules form submit in Settings: after `drawSettings()`, call `drawNav("settings")`.
- Import: after `drawSettings()`, call `drawNav("settings")`.
- Midnight listener: when the day changed and the user is onboarded, `safely(showPage)` whatever view is showing (not only Home).
- Initial focus: on the first `showPage()` at start-up, do not move focus (a page that steals focus on load is noisy for screen readers); only move it on later page changes. A module-level flag is enough.

- [ ] **Step 5: `web/js/app.js` — the module page and its log**

- `async function loadModulePage(id)`: fetch `api.getDashboard(today)` and `api.getDay(today)` together; `day = ` the day; find the entry with that id; `$("module-title").textContent = entry.label`; `$("module-body").innerHTML = renderModulePage(entry, dashboard.dates, today, day, settings)`.
- One delegated `submit` listener on `$("module-view")` for `#module-log-form`: `preventDefault`; build `changes` from the form's inputs exactly as the Home log handler does (blank → `null`; `time` inputs keep their string; numbers via `Number`), then apply the Sleep rule when `data-area` is `sleep` (with a schedule `changes.sleep_hours = null`, otherwise `bedtime` and `wake_time` set to `null`); `day = await api.putDay(today, { ...day, ...changes })`; `await loadModulePage(modulePage)`; then write `Saved HH:MM` into `#module-log-status` (after the redraw, since the redraw replaces the element). Wrap in `safely`.
- If the Home log handler and this one can share one small "read the inputs into changes" helper without contortions, share it; otherwise leave Home's alone.
- The existing document-level listeners (sleep-mode change, time inputs updating `.sleep-gap`) already cover the module page; do not duplicate them.

- [ ] **Step 6: Run both suites**

Run: `.venv/Scripts/python.exe -m pytest server/tests -q` and `node --test "web/tests/*.test.js"`
Expected: both all green (unchanged from Tasks 1 and 2).

- [ ] **Step 7: Start a scratch server**

Never use the real `compass.db` or port 8765. Start the app on port 8766 against a scratch database in the scratchpad or `.superpowers/` (`create_app(db_path)` in `server/app/main.py` takes the path; run it with uvicorn from `.venv`, host `127.0.0.1`). Delete the scratch database and stop the server when the task ends.

- [ ] **Step 8: Browser check with Playwright at 1280 px**

1. Fresh database: onboarding shows, `#side-nav` is hidden; setting the address to `#/sleep` by hand changes nothing.
2. Finish onboarding with Sleep and Work: address is `#/`, nav shows Home, Sleep, Work, Settings (no Study), Home has `aria-current="page"`.
3. Click Sleep: address `#/sleep`, heading "Sleep" has focus, four panels show, week panel matches the Home card's numbers.
4. Reload on `#/sleep`: still the Sleep page. Back goes to Home, Forward returns.
5. `#/study` and `#/nonsense`: Home shows and the address becomes `#/`.
6. Settings via the nav: only Modules, Habits, Goals, Your data. Tick Study and save: Study appears in the nav at once. Untick it: it leaves.
7. A Home card title click opens that module's page.
8. Console: no errors except the favicon 404. Every request goes to `127.0.0.1`.

- [ ] **Step 9: Browser check — the log leaves the rest of the day alone** (Review Focus 4)

On Home: add a focus task "Call the bank", type the note "keep me", log Work 3. Go to `#/sleep`, log 7 hours, Save. Expect "Saved HH:MM", Today's row "7 h", the week panel "7 h". Then `GET /api/days/<today>`: `sleep_hours` 7, `work_hours` 3, the task and the note still there. Clear the Sleep field and Save: Today's row reads "not logged" and `sleep_hours` is `null`.

- [ ] **Step 10: Browser check at 360 px**

Nav is a bottom bar with every link visible in one row; `document.documentElement.scrollWidth` is 360 on Home, each module page and Settings; scrolled to the bottom, the last panel's bottom edge is above the bar's top edge. Screenshots at 1280 and 360 of the Sleep page.

- [ ] **Step 11: Stop and report** (files changed, both test outputs, each browser check PASS or FAIL, screenshot paths). Note that modules cannot be edited anywhere until Task 4.

---

### Task 4: Edit on the module page

**Files:**
- Modify: `web/js/app.js`
- Modify: `web/styles.css` (only if the form needs spacing inside the details panel)

**Interfaces:**
- Consumes: `renderModuleEdit` (Task 2); `loadModulePage`, `modulePage` (Task 3); the existing `readSleepChoice(form)`, `withSleepChoice(settings, choice)`, `readStudyRows(container)`, `checkStudy(rows, hoursText)`, `withStudy(settings, goals, hours)`, `readWorkAnswer(index, fieldset)`, `withWork(settings, changes, hours)`, `changeStudyRows(event, container, prefix)`, `studyHours()`, `workHours()`.
- Produces: nothing later tasks call.

- [ ] **Step 1: Open and cancel**

Delegated `click` listener on `$("module-view")`:
- `#module-edit`: replace the contents of `#module-details` with `renderModuleEdit(modulePage, settings, hours)` where `hours` is `studyHours()`, `workHours()` or `null`; move focus to the form's first input, select or button.
- `#module-edit-cancel`: `await loadModulePage(modulePage)`, then focus `#module-edit`.
- Inside `#module-study`: pass the event to `changeStudyRows(event, $("module-study"), "mod")`.

- [ ] **Step 2: Save**

Delegated `submit` for `#module-edit-form` (the same listener as the log form, or a second one):
- Sleep: `readSleepChoice(form)` → on `error` show it in `module-edit-error`; else `withSleepChoice(settings, choice)`.
- Study: `checkStudy(readStudyRows($("module-study")), hoursText)` with the `study-hours` input's value → `withStudy(settings, goals, hours)`.
- Work: loop the six `.work-question` fieldsets with `readWorkAnswer(i, fieldset)`, folding each into `withWork(next, changes, hours)`, stopping at the first error (the same loop the old Settings handler used).
- Then `settings = await api.putSettings(next)`; `await loadModulePage(modulePage)`; focus `#module-edit`. A server error goes into `module-edit-error` with `showFormError`, and the form stays open with what was typed.

- [ ] **Step 3: Run both suites**

Expected: all green, counts unchanged.

- [ ] **Step 4: Browser check on the scratch server (port 8766, scratch database), 1280 px**

1. Sleep, goal: Edit sleep → type 8 → Save: details read "8 h a night", week panel "Target 8 h", the Home card says "Target 8 h". Focus is on the Edit button.
2. Sleep, schedule: Edit → schedule 22:30 / 06:30 → Save: details "In bed 22:30 · Up 06:30"; the log panel now has In bed and Up inputs. Edit → same time twice → "Fill in both times, and make them different." and the form stays open.
3. Cancel after typing: nothing saved, details unchanged, focus on Edit.
4. Study (switch it on first): Edit → "+ Add another" to 5 rows then "Up to 5 goals."; Remove works and typed text is kept; no name → "Tell Compass what you're studying for."; hours 200 → "Hours a week must be between 0 and 168."; a goal "Exam" dated 12 days ahead, hours 10 → Save: details "Exam · in 12 days", week "Target 10 h".
5. Work: Edit → Employed, role "Nurse", Mon to Fri 09:00 to 17:00 ("= 40 h a week" updates as you type), Morning, goal "Fix 3 bugs", Putting things off → Save: lines "Nurse", "Goal: Fix 3 bugs", "Mon to Fri, 09:00 to 17:00 · 40 h a week", "This week's tip: Pick a time to stop work today and keep to it."; week "Limit 40 h". Edit → a day with no times → "Enter a start and end time."; "It varies" + 25 → Save: "Hours vary · 25 h a week".
6. A role of `<b>x</b>` shows as text in the details.
7. With the Edit form open, saving the log closes the form and saves only the log.
8. Keyboard only: Tab reaches Edit, the form's controls, Save and Cancel; Enter in a text field saves.
9. 360 px: the Work edit form has no sideways scrolling; Save and Cancel are above the bottom bar when scrolled to the end.
10. Console clean except the favicon 404.

- [ ] **Step 5: Stop and report** (files changed, tests, each check PASS or FAIL). Stop the scratch server and delete the scratch database.

---

### Task 5: Preview and docs

**Files:**
- Modify: `web/preview.html`
- Modify: `README.md`, `FEATURES.md`, `docs/qa-checklist.md`, `2026-10-21-compass-v1-sdp.md`
- Modify: `docs/areas/sleep.md`, `docs/areas/study.md`, `docs/areas/work.md`

**Interfaces:**
- Consumes: the finished behaviour and the recorded browser checks from Tasks 3 and 4.
- Produces: nothing.

- [ ] **Step 1: `web/preview.html`** — add a static example of the nav and one module page (Sleep), built from the exact HTML `renderNav` and `renderModulePage` produce; card titles become links as `renderAreaCard` now writes them; remove any example of target rows.

- [ ] **Step 2: `README.md`**
- Features table: a row "**Module pages**" — "A page each for Sleep, Study and Work, reached from the menu: this week, the last 7 days, today's log, and its goal or schedule with an Edit button". Settings wording wherever it lists Sleep, Study or Work sections.
- API table: `GET /api/dashboard` — add "the 7 dates, and each area's page details".
- Project layout: `web/js/route.js`; `server/app/pages.py` in the rules list.
- Project status: a row "Side nav and module pages (2026-11-12) | Done; see `docs/superpowers/specs/2026-11-12-side-nav-module-pages-design.md`".
- Test counts: the real numbers from the last run of both suites.
- Status line at the top: Narrator checks now also include the nav and module pages.

- [ ] **Step 3: `FEATURES.md`** — Stage 4: a row "Side nav and module pages (Sleep, Study, Work) | Dashboard, Settings screen"; the Settings row reads "(modules, habits, goals, export, import, delete)".

- [ ] **Step 4: `docs/qa-checklist.md`**
- Append to each line about Settings > Targets, Settings > Study or Settings > Work (lines with those words): ` — superseded 2026-11-12: Sleep, Study and Work are edited on their own pages`.
- Add new lines, ticked only for checks actually recorded in Tasks 3 and 4, each ending `(checked by Claude in the browser, 2026-11-12)` — or the real date of the check: nav items and switched-off modules; addresses, reload, Back and Forward, bad addresses; nav hidden in onboarding and after Delete everything (tick only if checked); module page week panel and 7-day list; module log leaves the rest of the day alone; Edit, Save and Cancel for Sleep, Study, Work with their messages; Settings shows four sections; 360 px bottom bar and no sideways scrolling.
- Add unticked: `- [ ] Narrator: the nav (current page announced), a module page heading, the 7-day table, the Edit form and where focus goes after Save and Cancel`.
- If "nav hidden after Delete everything" was not checked in Task 3, check it now on the scratch server (Delete everything → onboarding shows, `#side-nav` hidden) and record it.

- [ ] **Step 5: SDP and area docs** — in `2026-10-21-compass-v1-sdp.md` add a short dated note (2026-11-12) where the web page and Settings are described: side nav, module pages, the three dashboard fields, Settings sections moved. In `docs/areas/*.md` replace "Settings > Sleep / Study / Work" (and "Settings > Targets" for Sleep) with the module's page and its Edit button.

- [ ] **Step 6: Final run of both suites**, then check that no file mentions `renderTargetRows`, `nav-settings"` as a button id, `settings-work-panel`, `settings-study-panel` or `settings-targets-panel` outside `docs/superpowers/` and `.superpowers/`.

- [ ] **Step 7: Stop and report** — every file changed in the whole plan, the final test counts, and what still needs a person (the Narrator line).

---

## After the plan

Per the spec, Claude then explains the code to the user in build order (rules, API, HTML, CSS, `route.js` and `render.js`, then `app.js`): what each piece does, why, and how to rebuild it from scratch.

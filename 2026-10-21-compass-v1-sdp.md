# Compass v1 Implementation Plan (polyglot: Python + Java + JS + HTML + CSS + API)

**How to use this plan:** work through the tasks in order. Each step has a checkbox (`- [ ]`) so you can tick it off as you go.

**Commit rule:** the user reviews and makes every commit. A "Commit" step means "hand the work over for review"; Claude never commits or merges, and only runs `git push` when the user asks (so they can pull elsewhere).

**Goal:** Ship Compass v1: a local, single-user life dashboard with onboarding-selected modules, a rules-based daily brief, area cards, focus tasks, habits, goals and quick capture, backed by a small local REST API.

**Architecture:** A Python (FastAPI + SQLite) server on `127.0.0.1` owns all rules (areas, status, trend, brief) and exposes a JSON REST API. A plain HTML/CSS/vanilla-JS front end is served by that same server and only renders what the API returns. A small Java command-line tool imports CSV exports (steps, fasting) through the API. v2 (TickTick, Google Calendar, AI assistant) later extends the same Python server, so v1 is its foundation.

**Tech Stack:** Python 3.12 (FastAPI, uvicorn, pydantic, stdlib `sqlite3`, pytest, httpx) | HTML5 + CSS (theme tokens, no framework) | vanilla JavaScript (ES modules, tests with Node's built-in `node:test`) | Java 17, JDK only, no build tool (`javac`, hand-rolled test runner) | REST/JSON API.
Verified on this machine: Python 3.12.10, Node 25.6.1, OpenJDK 17.0.20, git present; **Maven and Gradle are not installed**.

**Spec:** `C:\dev\personal-projects\Compass\README.md` (product spec) plus the Decisions and My calls sections below. This file: `2026-10-21-compass-v1-sdp.md`.

## Where to edit what (so you can change it yourself)
| You want to change... | Language | File |
|---|---|---|
| What the brief says, area rules, targets | Python | `server/app/brief.py`, `server/app/areas.py` |
| Endpoints / validation | Python | `server/app/routes.py`, `server/app/models.py` |
| Database | Python | `server/app/db.py` |
| Page structure | HTML | `web/index.html` |
| Look, themes, layout | CSS | `web/styles.css` |
| What happens on click, what is drawn | JavaScript | `web/js/app.js`, `web/js/render.js` |
| Talking to the server | JavaScript | `web/js/api.js` |
| CSV import | Java | `tools/importer/src/dev/compass/importer/*.java` |

## Global Constraints
- Server binds **127.0.0.1 only**, default port **8765**; the app makes **no requests to anything but its own server** (no CDN, no web fonts, no analytics).
- Missing values are **gaps, never zero**; a gap never counts against the user in the brief. A real `0` stays `0`.
- Max **5 enabled life areas**, max **3 focus tasks per day**, max **3 active goals**.
- Daily brief is **3-4 sentences**: (1) area furthest behind with the specific number, (2) one pattern, (3) one action taking **30 minutes or less**. It always exposes the numbers it used.
- Status is shown **in words** ("On track" / "Behind" / "No data"), never by colour alone.
- **No** badges, streak shaming, social features, medical advice, financial advice, bank integration, AI model calls (that is v2).
- Light, dark and system themes (system by default). One column on phones, 2-3 columns on wide screens.
- Export everything as one JSON file; delete everything from Settings only after confirmation.
- Dates are the user's **local** dates; the server never uses UTC for "today".
- Plain hyphen only (no em or en dashes) in all user-facing copy.
- API errors use `{"error": {"code": str, "message": str}}` with 4xx; never a stack trace.

## Decisions (from the conversation)
- Compass is the decision layer; other apps (TickTick, Google Calendar) are v2 data sources, not rebuilt.
- v1 is laptop-only and **advice-only** (no chat, no model, no write-back to other apps).
- Moodle dropped; Google Calendar replaces it in v2. Steps and fasting are manual or CSV in v1.
- Onboarding asks which modules to enable; each module works with zero integrations.
- Stack must be languages the user can edit: Python, Java, JavaScript, HTML, CSS, API.

## My calls (1 and 2 confirmed by the user on 2026-10-23)
1. **Data lives in SQLite on the server, not browser `localStorage`** (README v1 said localStorage). Reason: you asked for an API and Python, and this is the foundation v2 needs. Cost: v1 now needs `python start.py` instead of double-clicking an HTML file.
2. **Java's job is the CSV importer CLI only.** It is the one place Java is a natural fit and it is cleanly separable. It is the last task and can be dropped without affecting anything else. If you would rather have Java as the server, say so before approval and the plan changes shape.
3. **Java uses the JDK only** (no Maven/Gradle installed, no dependencies): `javac` to build, a ~40-line test runner instead of JUnit.
4. **FastAPI** over Flask for built-in request validation and auto-generated docs at `/docs` (a quick way to try the API).
5. Sixth module **Fasting** (average hours/day, target 16, "up"); at most 5 modules enabled in total.
6. Aggregation over the last 7 days: Sleep avg, Steps avg, Study sum, Work sum, Spending latest non-blank, Fasting avg.
7. "Pattern" sentence = weakest day of the 7-day window for the most-behind area (needs >= 4 data points), e.g. "Lowest was Thursday (5.5 h)".
8. Status: "up" areas On track at `value >= target`; "limit" areas On track at `value <= target`; no tolerance band.
9. Brief recomputes on every request (live as you log), not once each morning.

## Review Focus
Each line gets a pinning test in the task named in brackets.
1. **Blank or junk numeric input** (`""`, `"  "`, `"abc"`, `-3`, `1e9`) saves as a gap (`null`), never `0`; a real `0` is kept [Task 3].
2. **Other websites hitting the local API** (a page in your browser POSTing to `127.0.0.1:8765`, or DNS rebinding with a foreign `Host`) must be rejected: wrong `Host`, a foreign `Origin`, or a non-JSON `Content-Type` on writes -> 403/415 [Task 1].
3. **HTML in user text** (notes, goal/habit/task names such as `<img src=x onerror=alert(1)>`) renders as text, never markup [Task 9].
4. **Midnight and DST**: 23:59 vs 00:01 and DST-change days give correct date keys and a 7-day window of exactly 7 distinct dates [Task 2].
5. **Hostile or malformed import** (wrong schema, non-JSON, > 2 MB, wrong types) fails with 4xx and leaves existing data untouched; SQL is always parameterized [Tasks 4, 8].
6. **All-gap week and zero/negative targets**: brief says "Log today's numbers to get your first brief."; progress never divides by zero [Tasks 2, 7].
7. **Safety line**: 7-day average sleep under 5 h adds a "talk to a doctor" sentence and never diet/dose advice [Task 7].
8. **Delete-all safety**: `DELETE /api/data` without the confirm header is refused; with it, everything is removed and the app returns to onboarding [Task 8].
9. **CSV oddities** in the Java importer: BOM, quoted commas, blank values, bad dates, duplicate dates (last wins) [Task 12].

---

## Requirements traceability
| README requirement | Task |
|---|---|
| Daily brief (3-4 sentences, shows numbers) | 7, 10 |
| Area cards: value, progress, 7-day trend, status in words | 2, 8, 10 |
| Today's focus (max 3, done stays visible/muted) | 6, 11 |
| Habits 7-day grid + weekly completion | 6, 11 |
| Goals (max 3) | 6, 11 |
| Quick capture autosave | 11 |
| Settings: targets, habits, goals, theme, export, delete | 5, 8, 11 |
| Onboarding module selection (conversation) | 5, 10 |
| Gaps not zeros | 3, 7 |
| Local only, JSON export | 4, 8 |
| CSV import of steps/fasting (conversation) | 12 |
| Accessibility, themes, responsive | 9, 13 |

## Repository layout
```
Compass/
  start.py                         run script (creates venv, installs, starts server, opens browser)
  server/
    requirements.txt  requirements-dev.txt
    app/__init__.py
    app/main.py          create_app(db_path) factory, static mount, security middleware wiring
    app/security.py      HostOriginMiddleware
    app/areas.py         AREAS, date helpers, aggregates, status, progress, trend
    app/models.py        pydantic models + normalize_day
    app/settings_rules.py  select_modules, apply_onboarding, set_target
    app/lists.py         toggle_habit, habit_completion, add_task, add_goal
    app/brief.py         build_brief
    app/db.py            Repository (SQLite)
    app/routes.py        APIRouter, all /api endpoints
    tests/               test_*.py (pytest)
  web/
    index.html  styles.css
    js/api.js  js/render.js  js/app.js
    tests/render.test.js
  tools/importer/
    src/dev/compass/importer/{CsvReader,RowMapper,Main}.java
    test/dev/compass/importer/{TestRunner,CsvReaderTest}.java
    build.ps1   build.sh
  docs/qa-checklist.md
```

## Data model (schema version 1)
```
Day      { date: "YYYY-MM-DD", sleep_hours, steps, study_hours, work_hours, spend_pct_of_budget,
           fasting_hours: number|null, habits: {habitId: bool}, tasks: [{text, done}] (<=3), note: str }
Target   { area_id, target: number (>0), mode: "up"|"limit" }
Goal     { name, percent: 0-100, detail }
Settings { onboarded: bool, modules: [area_id] (1-5), targets: [Target], habits: [{id, name}],
           goals: [Goal] (<=3), theme: "light"|"dark"|"system" }
```
SQLite tables: `meta(key PRIMARY KEY, value)` (holds `schema_version`), `days(date PRIMARY KEY, json TEXT)`, `settings(id=1, json TEXT)`.

## API contract (all JSON, prefix `/api`)
| Method + path | Purpose |
|---|---|
| `GET /health` | `{"status":"ok"}` |
| `GET /api/settings` / `PUT /api/settings` | read / replace settings (validated) |
| `POST /api/onboarding` `{modules:[ids]}` | enable modules, set default targets, `onboarded=true` |
| `GET /api/days/{date}` / `PUT /api/days/{date}` | read (empty day if none) / save a day (normalized) |
| `POST /api/days/bulk` `{days:[{date, <field>:number}]}` | merge numeric fields only (used by Java importer); returns `{saved:int, skipped:[{date,reason}]}` |
| `GET /api/dashboard?date=YYYY-MM-DD` | `{brief:{sentences,facts}, areas:[{id,label,value,target,mode,status,progress,trend,series}], habits:{grid,completion}}` |
| `GET /api/export` | full JSON backup |
| `POST /api/import` | replace all data from a backup (<= 2 MB) |
| `DELETE /api/data` | requires header `X-Confirm: delete-all` |

---

### Task 1: Server scaffold, health check and request-origin protection

**Files:**
- Create: `server/requirements.txt`, `server/requirements-dev.txt`, `server/app/__init__.py`, `server/app/main.py`, `server/app/security.py`
- Test: `server/tests/test_security.py`

**Interfaces:**
- Produces: `create_app(db_path: str = "compass.db") -> FastAPI`; `HostOriginMiddleware` rejecting requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`, whose `Origin` (when present) is not the same origin, or whose write method (`POST/PUT/DELETE`) lacks `Content-Type: application/json` (bodyless `DELETE` exempt).

- [x] **Step 1: Write failing tests** (pytest + `fastapi.testclient.TestClient`): `GET /health` with `Host: 127.0.0.1:8765` -> 200 `{"status":"ok"}`; `Host: evil.com` -> 403; `Host: 127.0.0.1:8765` + `Origin: https://evil.com` -> 403; `POST /api/settings` with `Content-Type: text/plain` -> 415; no CORS headers (`access-control-allow-origin`) on any response.
- [x] **Step 2: Run** `python -m pytest server/tests/test_security.py -v` -> FAIL (module missing).
- [x] **Step 3: Implement** `create_app` and the middleware; error body uses the Global Constraints error shape. After first successful `pip install`, pin versions by writing `pip freeze` output for the runtime packages into `requirements.txt`.
- [x] **Step 4: Run** the same command -> PASS.
- [x] **Step 5: Commit** `feat(server): scaffold with origin protection`.

### Task 2: Areas, dates, status, progress, trend

**Files:** Create `server/app/areas.py`; Test `server/tests/test_areas.py`

**Interfaces:**
- Produces:
  - `date_key(d: datetime.date) -> str` (local `YYYY-MM-DD`); `last_n_dates(end_key: str, n: int) -> list[str]` oldest first
  - `AREAS: list[Area]` where `Area = dataclass(id, label, unit, field, aggregate: Literal["avg","sum","latest"], default_target: float, default_mode: Literal["up","limit"], suggestion: str)` for `sleep, steps, study, work, spending, fasting` (README table values; fasting 16 h "up")
  - `area_value(area: Area, days: list[dict]) -> float | None`
  - `area_status(value: float | None, target: float, mode: str) -> Literal["on_track","behind","no_data"]`
  - `area_progress(value, target, mode) -> float | None` (percent, clamped 0-200, `None` if no data or `target <= 0`)
  - `trend(series: list[float | None]) -> Literal["up","down","flat","none"]` (later-half mean vs earlier-half mean, 5% threshold, `none` with fewer than 2 points)

- [x] **Step 1: Write failing tests:** `last_n_dates("2026-10-21", 7)` is 7 distinct ascending keys; across `2026-03-29` (EU DST) and `2026-11-01` (US DST) still 7 distinct (Review Focus 4); status up `7.5/7.5 -> on_track`, `7.4 -> behind`; limit `100/100 -> on_track`, `101 -> behind`; `None -> no_data`; `area_progress(5, 0, "up") is None` (Review Focus 6); `area_value` sums study, averages sleep ignoring gaps, takes latest spending; `trend([5,5,5,8,8,8,8]) == "up"`; `trend([None]*6 + [6]) == "none"`.
- [x] **Step 2: Run** `python -m pytest server/tests/test_areas.py -v` -> FAIL. **Step 3: Implement** in `areas.py`; iterate dates with `timedelta`, not epoch seconds. **Step 4: Run** -> PASS (29 tests).
- [ ] **Step 5: Commit** `feat(server): life areas and status rules`.

### Task 3: Day model and normalization (gap semantics)

**Files:** Create `server/app/models.py`; Test `server/tests/test_models.py`

**Interfaces:**
- Consumes: `AREAS` field names (Task 2)
- Produces: `normalize_day(raw: dict, date: str) -> dict` (always returns a complete Day dict) and pydantic models `Target`, `Goal`, `Settings`

- [x] **Step 1: Write failing tests (Review Focus 1):** for every numeric field, `""`, `"  "`, `None`, `"abc"`, `-3`, `float("nan")` -> `None`; `"7.5"` -> `7.5`; `0` stays `0`; `sleep_hours=30` -> `None` (valid 0-24); `steps=8000.7` -> `8000`; `spend_pct_of_budget` valid 0-1000; hour fields 0-24; more than 3 tasks -> keep first 3; blank task text dropped; `note` coerced to str, truncated at 5000; `habits` keeps only bool values; unknown keys dropped.
- [x] **Step 2-4:** run (FAIL), implement, run (PASS) (95 tests).
- [ ] **Step 5:** commit `feat(server): day normalization`.

### Task 4: SQLite repository

**Files:** Create `server/app/db.py`; Test `server/tests/test_db.py`

**Interfaces:**
- Consumes: `normalize_day`, `Settings` (Task 3)
- Produces: `Repository(path: str)` with `get_day(date) -> dict`, `put_day(day: dict) -> None`, `days_between(start: str, end: str) -> list[dict]`, `get_settings() -> Settings`, `put_settings(s: Settings) -> None`, `export_all() -> dict`, `import_all(data: dict) -> None` (raises `ValueError` on bad input, all-or-nothing in one transaction), `delete_all() -> None`

- [x] **Step 1: Write failing tests (Review Focus 5)** using a temp-file DB: round-trip day and settings; `get_day` for an unknown date returns an empty Day; `export_all()` then `import_all()` into a fresh DB yields identical data; `import_all` with wrong `schema`, a non-dict, or an invalid day raises `ValueError` and leaves prior data intact (transaction rolled back); a note containing `'; DROP TABLE days;--` round-trips and the table survives; `delete_all()` empties days and resets settings to defaults (`onboarded=False`).
- [x] **Step 2-4:** run (FAIL), implement (parameterized SQL only, `meta.schema_version`), run (PASS) (23 tests).
- [ ] **Step 5:** commit `feat(server): sqlite repository`.

### Task 5: Settings and onboarding rules

**Files:** Create `server/app/settings_rules.py`; Test `server/tests/test_settings_rules.py`

**Interfaces:**
- Consumes: `AREAS` (Task 2), `Settings` (Task 3)
- Produces: `select_modules(ids: list[str]) -> list[str]` (raises `ValueError`: empty, > 5, unknown id; dedupes, keeps order); `apply_onboarding(s: Settings, ids: list[str]) -> Settings` (targets only for enabled modules from `AREAS` defaults, `onboarded=True`); `set_target(s: Settings, area_id: str, target: float, mode: str) -> Settings` (raises `ValueError` if `target <= 0`)

- [x] **Step 1: Write failing tests:** 0 ids, 6 ids, unknown id each raise; duplicates collapse; onboarding creates exactly one target per enabled module; `set_target(..., 0, ...)` raises.
- [x] **Step 2-5:** run (FAIL), implement, run (PASS) (16 tests), commit `feat(server): onboarding and settings rules`.

### Task 6: Habits, tasks, goals logic

**Files:** Create `server/app/lists.py`; Test `server/tests/test_lists.py`

**Interfaces:**
- Produces: `toggle_habit(day: dict, habit_id: str) -> dict`; `habit_completion(days: list[dict], habits: list[dict]) -> float | None` (percent of habit-days done, counting only days that have any logging; `None` if no habits or no logged days); `add_task(day: dict, text: str) -> dict` (raises `ValueError` on blank or a 4th task); `toggle_task(day: dict, index: int) -> dict`; `add_goal(goals: list[Goal], goal: Goal) -> list[Goal]` (raises `ValueError` on a 4th; percent clamped 0-100)

- [x] **Step 1: Write failing tests** for each rule, including that a day with nothing logged is not counted as missed.
- [x] **Step 2-5:** run (FAIL), implement, run (PASS) (19 tests), commit `feat(server): habits, tasks, goals rules`.

### Task 7: Rules-based daily brief

**Files:** Create `server/app/brief.py`; Test `server/tests/test_brief.py`

**Interfaces:**
- Consumes: Tasks 2 and 5 outputs
- Produces: `build_brief(days: list[dict], settings: Settings, today: str) -> Brief` where `Brief = {"sentences": list[str], "facts": list[{"area_id","value","target","mode"}]}`

Rules: only enabled modules, only the 7 dates ending `today`. Behind-ness = `(target - value) / target` for "up", `(value - target) / target` for "limit"; the largest positive is "furthest behind". Sentence 1 names it with value and target (e.g. "Sleep is furthest behind: 6.4 h average against 7.5 h."). Sentence 2 = weakest day if >= 4 data points. Sentence 3 = the area's `suggestion` (<= 30 min). If nothing is behind, sentence 1 says what is going well.

- [x] **Step 1: Write failing tests:** (a) sleep behind, rest on track -> sentence 1 mentions "Sleep" and "6.4"; (b) gaps excluded from averages; (c) all-gap week -> one sentence "Log today's numbers to get your first brief." and empty `facts` (Review Focus 6); (d) average sleep < 5 h adds a sentence containing "talk to a doctor" and no words "diet", "dose", "medication" (Review Focus 7); (e) disabled modules never appear; (f) 3-4 sentences when data exists; (g) every number in the sentences appears in `facts`; (h) no "â€”" or "â€“" in output.
- [x] **Step 2-5:** run (FAIL), implement, run (PASS) (22 tests), commit `feat(server): rules-based brief`.

### Task 8: REST routes and API contract tests

**Files:** Create `server/app/routes.py`; Modify `server/app/main.py`; Test `server/tests/test_api.py`

**Interfaces:**
- Consumes: Tasks 1-7
- Produces: every endpoint in the API contract table, mounted by `create_app`; `/docs` stays available.

- [x] **Step 1: Write failing tests (TestClient, temp DB, correct Host header):** fresh app `GET /api/settings` shows `onboarded=false`; `POST /api/onboarding` with 6 modules -> 422 error shape; onboarding with 3 -> settings updated; `PUT /api/days/2026-10-20` with `sleep_hours: ""` stores `null`; `PUT` with 4 tasks -> 422; `POST /api/days/bulk` merges only numeric fields and reports `skipped` for bad dates/values, never overwrites tasks/notes/habits; `GET /api/dashboard?date=2026-10-21` returns brief and one entry per enabled area with `status` in words; export -> import round-trip; `POST /api/import` of 3 MB body -> 413, bad JSON -> 400, and data unchanged (Review Focus 5); `DELETE /api/data` without `X-Confirm` -> 400, with it -> 200 and `GET /api/settings` shows `onboarded=false` (Review Focus 8).
- [x] **Step 2: Run** `python -m pytest server/tests -v` -> new tests FAIL.
- [x] **Step 3: Implement** routes as thin glue over the repository and rule modules (no rules in routes); map `ValueError` to the 422 error shape; enforce the 2 MB import cap by checking `Content-Length` and the read size.
- [x] **Step 4: Run** full suite -> PASS (244 tests). **Step 5: Commit** `feat(server): REST API`.

### Task 9: Front-end shell, renderers, escaping (HTML, CSS, JS)

**Files:** Create `web/index.html`, `web/styles.css`, `web/js/render.js`; Test `web/tests/render.test.js`

**Interfaces:**
- Produces (ES module exports in `render.js`): `escapeHtml(s: string): string`; `renderBrief(brief): string`; `renderAreaCard(area): string`; `renderOnboarding(areas, selectedIds): string`; `renderHabitGrid(grid, habits): string`; `renderGoals(goals): string`; `renderTasks(tasks): string`

- [ ] **Step 1: Write failing tests with `node:test` (Review Focus 3):** `escapeHtml('<img src=x onerror=alert(1)>')` contains no `<`; every renderer given `<script>` in goal/habit/task/note text yields no raw `<script`; `renderAreaCard` shows the literal words "On track" / "Behind" / "No data" and an `aria-label` containing value and target; `renderOnboarding` marks selected modules and shows "Choose up to 5".
- [ ] **Step 2: Run** `node --test web/tests/` -> FAIL.
- [ ] **Step 3: Implement** `render.js` (all user text through `escapeHtml`); write `index.html` (semantic landmarks, `<main>`, labelled form controls) and `styles.css`: colour tokens on `:root`, dark values under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and again under `:root[data-theme="dark"]`, explicit `body` background, one column up to 600 px then a grid, visible focus outlines, system font stack only.
- [ ] **Step 4: Run** -> PASS. **Step 5: Commit** `feat(web): shell, renderers, escaping`.

### Task 10: Front end - onboarding, brief, area cards, daily log

**Files:** Create `web/js/api.js`, `web/js/app.js`; Modify `web/index.html`

**Interfaces:**
- Consumes: Task 8 API, Task 9 renderers
- Produces (`api.js`): `getSettings(): Promise<Settings>`, `postOnboarding(ids): Promise<Settings>`, `getDashboard(date): Promise<Dashboard>`, `getDay(date)`, `putDay(date, day)`, plus a shared `request()` that throws `ApiError{code,message}` using the error shape.

- [ ] **Step 1:** first load: if `onboarded=false` show onboarding (Task 9 view), submit via `postOnboarding`; show the server's message on 422. **Step 2:** render brief with a "Numbers used" disclosure listing `facts`, and one card per enabled area with trend text. **Step 3:** daily log form for enabled areas only; blank inputs send `null`; saving calls `putDay` then re-fetches the dashboard. **Step 4:** a dismissible banner for any `ApiError`. **Step 5: Manual verification** - run `python start.py`, complete onboarding with 3 modules, log a day with one field blank, confirm that card says "No data" and the brief ignores it. **Step 6: Commit** `feat(web): onboarding, brief, cards, daily log`.

### Task 11: Front end - focus, habits, goals, capture, settings

**Files:** Modify `web/js/app.js`, `web/js/api.js`, `web/index.html`

- [ ] **Step 1:** focus tasks (max 3; done items muted but visible; blank rejected with a message). **Step 2:** 7-day habit grid, one tap per cell, weekly completion shown. **Step 3:** goals (max 3) with percent and one-line detail, hand-edited. **Step 4:** quick capture textarea with 500 ms debounced autosave and save on blur. **Step 5:** Settings screen: targets per enabled module, habit list, goal list, module re-selection, theme (writes `data-theme` on `<html>`, persisted in settings), **Export** (download `compass-YYYY-MM-DD.json`), **Import** (shows server error, never replaces on failure), **Delete everything** (confirm dialog, then sends `X-Confirm: delete-all`). **Step 6: Manual verification** with `docs/qa-checklist.md` sections 1-3. **Step 7: Commit** `feat(web): focus, habits, goals, capture, settings`.

### Task 12: Java CSV importer (CLI)

**Files:**
- Create: `tools/importer/src/dev/compass/importer/CsvReader.java`, `RowMapper.java`, `Main.java`; `tools/importer/test/dev/compass/importer/TestRunner.java`, `CsvReaderTest.java`; `tools/importer/build.ps1`, `build.sh`

**Interfaces:**
- Produces:
  - `CsvReader.parse(String text) -> List<List<String>>` (handles UTF-8 BOM, quoted commas, escaped quotes, CRLF/LF)
  - `RowMapper.map(List<List<String>> rows, String dateCol, String valueCol, String field, String dateFormat) -> MapResult` where `MapResult` holds `List<DayValue(String date, String field, Double value)>` and `List<Skipped(int row, String reason)>`; duplicate dates: last wins; blank values skipped (never 0)
  - `Main` flags: `--file <csv> --date-col <name|index> --value-col <name|index> --field <steps|fasting_hours|sleep_hours|study_hours|work_hours> [--date-format yyyy-MM-dd] [--url http://127.0.0.1:8765] [--dry-run]`; builds the JSON body by hand and POSTs to `/api/days/bulk` with `java.net.http.HttpClient`; `--dry-run` prints the body and the skipped rows and sends nothing; exit code 0 on success, 2 on bad arguments, 1 on server error.

- [ ] **Step 1: Write failing tests** in `CsvReaderTest.java` run by `TestRunner` (prints PASS/FAIL per test, exit 1 on any failure) (Review Focus 9): BOM stripped; `"a,b",c` yields 2 cells; `""` escaped quote; blank value skipped, not 0; bad date reported in `skipped`; duplicate date keeps last; `--field` outside the allowed list rejected.
- [ ] **Step 2: Run** `./tools/importer/build.ps1` -> compile error / FAIL (classes missing).
- [ ] **Step 3: Implement** with JDK only; `build.ps1` runs `javac -d out` for `src` and `test`, then `java -cp out dev.compass.importer.TestRunner`; a second mode builds a runnable `out` for `java -cp out dev.compass.importer.Main ...`.
- [ ] **Step 4: Run** build script -> all PASS. **Step 5: Live check:** with the server running and a 3-row sample CSV in `tools/importer/sample.csv`, `--dry-run`, then without it; `GET /api/days/<date>` shows the stored step count and other fields untouched. **Step 6: Commit** `feat(importer): Java CSV importer for steps and fasting`.

### Task 13: Launcher, QA pass, documentation

**Files:** Create `start.py`, `docs/qa-checklist.md`; Modify `README.md`

**Interfaces:**
- Produces: `python start.py [--port 8765]` which creates `.venv` if missing, installs `server/requirements.txt`, starts uvicorn bound to `127.0.0.1`, and opens the browser.

- [ ] **Step 1:** implement `start.py`; refuse to start if the port is taken, with a clear message. **Step 2:** write `docs/qa-checklist.md`: keyboard-only use of every control; screen-reader labels; contrast >= 4.5:1 in light and dark; 360 px and 1440 px layouts; system-clock change across midnight; export -> delete -> import round-trip; stress inputs (`<script>`, 5000-char note, a real `0`, 6 modules); confirm in browser devtools that the only network host is `127.0.0.1`; confirm `curl -H "Host: evil.com" http://127.0.0.1:8765/health` returns 403. **Step 3:** run the checklist; each logic defect gets a failing test first, each UI defect a manual re-check. **Step 4:** update README (Getting started = `python start.py`; layout; tests: `python -m pytest server/tests`, `node --test web/tests/`, `tools/importer/build.ps1`). **Step 5:** run all three test commands -> all green. **Step 6: Commit** `docs: launcher, QA checklist, README`.

---

## Definition of Done (v1)
- `python -m pytest server/tests`, `node --test web/tests/`, and `tools/importer/build.ps1` all pass.
- QA checklist signed off; Review Focus 1-9 each have a passing named test or a ticked manual check.
- App starts with one command, works offline, makes requests only to `127.0.0.1`.
- Every Global Constraint holds; README matches behaviour.
- Success measures from the README (opens 5 days/week, < 5 min to log a day, one behaviour changed because of the brief) are tracked for 4 weeks after release, not a build gate.

## Risks (v1)
| Risk | Mitigation |
|---|---|
| Local API reachable from other sites | Task 1 Host/Origin/Content-Type checks; 127.0.0.1 bind; no CORS |
| Polyglot overhead slows a small app | Java isolated to Task 12 and droppable; Python holds all rules; JS only renders |
| Manual entry fatigue | Blanks allowed, max 5 areas, CSV import for steps/fasting |
| Pinned dependencies drift | Pin after first install (Task 1); no runtime deps in web or Java |
| Java without Maven is unfamiliar | JDK-only build script, test runner included; Maven can be adopted later |

## Self-review
- **Spec coverage:** every README v1 feature maps to a task (traceability table); onboarding, fasting module, API and CSV import come from the conversation.
- **Type consistency:** `Area`, `Day`, `Settings`, `normalize_day`, `build_brief`, `Repository`, API paths and the error shape use identical names across tasks.
- **Proportion:** code appears only as signatures, test assertions and rules; no function bodies.
- **Deviation to confirm:** My calls 1 and 2 (SQLite server instead of localStorage; Java limited to the importer).

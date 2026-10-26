# Compass

A local, single-user life dashboard that reads your last seven days and tells you what to do next.

You log a few numbers a day (sleep, steps, study, work, spending, fasting). Compass turns them into a short rules-based brief: the area furthest behind its target, one pattern worth noticing, and one action that takes 30 minutes or less. Everything runs on your own computer.

> **Status: work in progress.** The Python API is complete and tested. The web page, launcher and Java CSV importer are not finished yet, so there is no one-command way to use the app today. See [Project status](#project-status).

---

## How it works

```text
 Browser page (HTML, CSS, vanilla JS)      Java CSV importer (CLI)
            |                                        |
            |  JSON over http://127.0.0.1:8765       |  POST /api/days/bulk
            v                                        v
   +-------------------------------------------------------+
   |  Python server (FastAPI)                              |
   |  all rules: areas, status, trend, daily brief         |
   |                     |                                 |
   |                  SQLite (compass.db)                  |
   +-------------------------------------------------------+
```

The server owns every rule. The page only draws what the API returns. Data lives in SQLite on your machine, not in the browser.

## Features (v1)

| Feature | What it does |
|---|---|
| **Onboarding** | Pick 1 to 5 of six modules; each gets a default target |
| **Daily brief** | 3-4 sentences from the last 7 days, plus the numbers it used |
| **Area cards** | Value, progress, 7-day trend, and status in words: "On track", "Behind", "No data" |
| **Today's focus** | Up to 3 tasks a day |
| **Habits** | 7-day yes/no grid with a weekly completion rate |
| **Goals** | Up to 3, each with a percent and one line of context |
| **Quick capture** | A daily note (up to 5000 characters) |
| **Your data** | Export to one JSON file, import it back, or delete everything |

The six modules and their default targets:

| Module | 7-day value | Default target |
|---|---|---|
| Sleep | average hours | 7.5 h, more is better |
| Movement | average steps | 8,000, more is better |
| Study | total hours | 12 h, more is better |
| Work | total paid hours | 16 h, more is better |
| Spending | latest % of monthly budget | 100%, stay under |
| Fasting | average hours | 16 h, more is better |

**Blank is a gap, never zero.** A missing value never counts against you, and a real `0` stays `0`. If the 7-day sleep average falls under 5 h, the brief suggests talking to a doctor. Compass gives no medical or financial advice, and v1 makes no AI model calls.

## Privacy and security

Compass talks only to its own server. No CDN, web fonts, or analytics.

- The server is meant to bind to `127.0.0.1` only (default port `8765`).
- Requests with a `Host` other than `127.0.0.1` or `localhost`, or with a foreign `Origin`, get `403`.
- Writes (`POST`, `PUT`, `DELETE`) with a body that is not `application/json` get `415`. This stops other websites open in your browser from writing to the local API.
- `DELETE /api/data` refuses to run without the header `X-Confirm: delete-all`.
- Imports are capped at 2 MB and are all-or-nothing: a bad backup leaves existing data untouched.

---

## Getting started

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Python | 3.12 | server and tests |
| Node.js | with built-in `node:test` | web tests (in progress) |
| JDK | 17, no Maven or Gradle | CSV importer (in progress) |

### Install

```bash
git clone https://github.com/saidn-dev/Compass.git
cd Compass
python -m venv .venv
```

Activate the virtual environment, then install the server and test dependencies:

```powershell
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
source .venv/bin/activate
```

```bash
pip install -r server/requirements-dev.txt
```

### Run the tests

From the repository root:

```bash
python -m pytest server/tests
```

All 244 server tests should pass.

### Try the API

The launcher (`python start.py`) is not written yet. Until it is, you can start the server directly and explore the API in the browser at `http://127.0.0.1:8765/docs`:

```bash
python -m uvicorn app.main:app --app-dir server --host 127.0.0.1 --port 8765
```

<!-- TODO: replace this section with `python start.py` once Task 13 is done. -->

The database file `compass.db` is created in the folder you start the server from. It is ignored by git.

---

## API

All endpoints take and return JSON. Errors always look like `{"error": {"code": "...", "message": "..."}}`.

| Method and path | Purpose |
|---|---|
| `GET /health` | `{"status": "ok"}` |
| `GET /api/settings` | Read settings |
| `PUT /api/settings` | Replace settings (validated) |
| `POST /api/onboarding` | `{"modules": [...]}`: enable modules and set default targets |
| `GET /api/days/{date}` | Read one day (`YYYY-MM-DD`); empty day if none |
| `PUT /api/days/{date}` | Save one day; blank or invalid numbers become `null` |
| `POST /api/days/bulk` | Merge numeric fields only; returns `{"saved", "skipped"}` |
| `GET /api/dashboard?date=YYYY-MM-DD` | Brief, area cards and habit grid; date defaults to local today |
| `GET /api/export` | Full JSON backup |
| `POST /api/import` | Replace all data from a backup (max 2 MB) |
| `DELETE /api/data` | Delete everything; needs `X-Confirm: delete-all` |

With the server running, you can check the dashboard and the Host guard from the command line:

```bash
curl http://127.0.0.1:8765/api/dashboard
curl -H "Host: evil.com" http://127.0.0.1:8765/health
```

The first returns the dashboard JSON. The second returns `403` with the error code `forbidden_host`.

---

## Project layout

| Path | Language | Contents |
|---|---|---|
| `server/app/` | Python | API, rules (`areas.py`, `brief.py`, `lists.py`, `settings_rules.py`), SQLite (`db.py`), security (`security.py`) |
| `server/tests/` | Python | pytest suite |
| `web/` | HTML, CSS, JS | `index.html`, `styles.css`, `js/`; `preview.html` is a static design preview |
| `web/tests/` | JS | `node:test` tests for the renderers |
| `tools/importer/` | Java | CSV importer for steps and fasting |
| `start.py` | Python | one-command launcher |
| `docs/` | Markdown | product spec and QA checklist |

## Project status

| Part | State |
|---|---|
| Server: rules, database, REST API, security (Tasks 1-8) | Done, 244 tests passing |
| Web page: `index.html`, `styles.css` (Task 9) | Written; dark theme only for now |
| Web page: JavaScript (Tasks 9-11) | In progress (`web/js/` holds task notes only) |
| Server serving the `web/` folder | Not yet |
| Java CSV importer (Task 12) | Planned; `Main.java` is a stub |
| Launcher `start.py` and QA pass (Task 13) | Planned; `start.py` is a stub |

**Later (v2):** TickTick and Google Calendar as data sources, and an optional AI assistant, built on the same server.

## Documentation

- [docs/product-spec.md](docs/product-spec.md): the original product spec. Parts are out of date: v1 stores data in SQLite on a local server instead of the browser's `localStorage`, and starts with `python start.py` instead of opening an HTML file.
- [2026-10-21-compass-v1-sdp.md](2026-10-21-compass-v1-sdp.md): the v1 implementation plan, with every rule, constraint and task.
- [FEATURES.md](FEATURES.md): features in build order.
- [docs/qa-checklist.md](docs/qa-checklist.md): manual checks before v1 is called done.

<!-- TODO: the SDP's "Spec:" line still points to README.md; update it to docs/product-spec.md. -->

## License

Compass is released under the [MIT License](LICENSE).

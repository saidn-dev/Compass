# Compass

A local, single-user life dashboard that reads your last seven days and tells you what to do next.

You log a few numbers a day (sleep, steps, study, work, spending, fasting). Compass turns them into a short rules-based brief: the area furthest behind its target, one pattern worth noticing, and one action that takes 30 minutes or less. Everything runs on your own computer.

> **Status: v1 feature-complete.** Start it with `python start.py`. A few manual checks (keyboard-only use, screen reader, midnight rollover) are still open in the [QA checklist](docs/qa-checklist.md).

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

- `start.py` binds the server to `127.0.0.1` only (default port `8765`), so other computers can't reach it.
- Requests with a `Host` other than `127.0.0.1` or `localhost`, or with a foreign `Origin`, get `403`.
- Writes (`POST`, `PUT`, `DELETE`) with a body that is not `application/json` get `415`. This stops other websites open in your browser from writing to the local API.
- `DELETE /api/data` refuses to run without the header `X-Confirm: delete-all`.
- Imports are capped at 2 MB and are all-or-nothing: a bad backup leaves existing data untouched.

---

## Getting started

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Python | 3.12 | the app, server tests |
| Node.js | 21 or newer (tested on 25) | web tests only |
| JDK | 17, no Maven or Gradle | CSV importer only |

### Run Compass

```bash
git clone https://github.com/saidn-dev/Compass.git
cd Compass
python start.py
```

The first run creates `.venv` and installs the server's packages. After that, `python start.py` starts the server on `http://127.0.0.1:8765/` and opens it in your browser. Press `Ctrl+C` to stop.

| Option | Meaning |
|---|---|
| `--port 8766` | Use another port (it refuses to start if the port is busy) |
| `--no-browser` | Don't open the browser |

Your data is saved in `compass.db` in the repository folder. It is ignored by git. Use **Settings → Export** for a backup.

### Import steps or fasting from a CSV

Build the importer once, then point it at a CSV export while Compass is running:

```powershell
./tools/importer/build.ps1 build        # or: sh tools/importer/build.sh build
java -cp tools/importer/out dev.compass.importer.Main --file steps.csv --date-col date --value-col steps --field steps --dry-run
```

`--dry-run` shows what would be sent; run again without it to save. Columns can be header names or numbers (1 = first column). `--field` is one of `steps`, `fasting_hours`, `sleep_hours`, `study_hours`, `work_hours`. Use `--date-format dd/MM/yyyy` (or similar) if your dates are not `YYYY-MM-DD`. Blank values are skipped, never saved as 0, and only that one number is changed for each day. Run with `--help` for all options. `tools/importer/sample.csv` is a small example.

### Run the tests

The server tests need the dev packages in `.venv`:

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

Then, from the repository root:

| Suite | Command | Count |
|---|---|---|
| Server (pytest) | `python -m pytest server/tests` | 249 |
| Web renderers (`node:test`) | `node --test "web/tests/*.test.js"` | 18 |
| Java importer | `./tools/importer/build.ps1` (or `sh tools/importer/build.sh`) | 18 |

While the server is running, `http://127.0.0.1:8765/docs` lets you try every API endpoint in the browser.

---

## API

All endpoints take and return JSON. Errors always look like `{"error": {"code": "...", "message": "..."}}`.

| Method and path | Purpose |
|---|---|
| `GET /health` | `{"status": "ok"}` |
| `GET /api/areas` | The six modules with their labels, units and default targets |
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
| Server: rules, database, REST API, security (Tasks 1-8) | Done |
| Web page, served by the server (Tasks 9-11) | Done; dark theme only for now |
| Java CSV importer (Task 12) | Done |
| Launcher `start.py` (Task 13) | Done |
| QA pass (Task 13) | Mostly done; keyboard, screen reader and midnight checks still open |

**Later (v2):** TickTick and Google Calendar as data sources, and an optional AI assistant, built on the same server.

## Documentation

- [docs/product-spec.md](docs/product-spec.md): the original product spec. Parts are out of date: v1 stores data in SQLite on a local server instead of the browser's `localStorage`, and starts with `python start.py` instead of opening an HTML file.
- [2026-10-21-compass-v1-sdp.md](2026-10-21-compass-v1-sdp.md): the v1 implementation plan, with every rule, constraint and task.
- [FEATURES.md](FEATURES.md): features in build order.
- [docs/qa-checklist.md](docs/qa-checklist.md): manual checks before v1 is called done.

## License

Compass is released under the [MIT License](LICENSE).

# Compass

A local, single-user life dashboard that reads your last seven days and tells you what to do next.

You log a few numbers a day (sleep, study, work). Compass turns them into a short rules-based brief: the area furthest behind its target, one pattern worth noticing, and one action that takes 30 minutes or less. Everything runs on your own computer.

> **Status: v1 done.** Start it with `python start.py`. Every check in the [QA checklist](docs/qa-checklist.md) has passed except the Narrator checks (onboarding, Sleep, Study, Work, and the menu and module pages), which still need a person.

---

## How it works

```text
 Browser page (HTML, CSS, vanilla JS)
            |
            |  JSON over http://127.0.0.1:8765
            v
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
| **Onboarding** | Welcome, then pick any of the three modules, a Sleep page (a goal, a schedule, or help working one out), a Study page (what you're studying for, dates, hours a week), six one-question Work screens (type of work, role, days and hours, best focus time, a 3-month goal, what gets in the way), optional habits and goals |
| **Module pages** | A page each for Sleep, Study and Work, reached from the menu: this week, the last 7 days, today's log, and its goal or schedule with an Edit button |
| **Sleep** | With a sleep schedule you log bed and wake times and Compass works out the hours; the brief says how often you were in bed on time |
| **Daily brief** | 3-4 sentences from the last 7 days, plus the numbers it used |
| **Area cards** | Value, progress, 7-day trend, and status in words: "On track", "Behind", "No data" |
| **Today's focus** | Up to 3 tasks a day |
| **Habits** | 7-day yes/no grid with a weekly completion rate |
| **Goals** | Up to 3, each with a percent and one line of context |
| **Quick capture** | A daily note (up to 5000 characters) |
| **Your data** | Export to one JSON file, import it back, or delete everything |

The three modules and their default targets:

| Module | 7-day value | Default target |
|---|---|---|
| Sleep | average hours | 7.5 h, more is better |
| Study | total hours | 12 h, more is better |
| Work | total paid hours (hours spent searching for job hunters) | 16 h, more is better; with Work answers it comes from your work days and hours, or a typed number, and "Employed" means stay under |

Movement (steps) was taken out on 2026-11-08: logging steps by hand needs a step counter, so it comes back in v2 when Compass can read them from another app.

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
| Server (pytest) | `python -m pytest server/tests` | 414 |
| Web renderers and addresses (`node:test`) | `node --test "web/tests/*.test.js"` | 53 |

While the server is running, `http://127.0.0.1:8765/docs` lets you try every API endpoint in the browser.

---

## API

All endpoints take and return JSON. Errors always look like `{"error": {"code": "...", "message": "..."}}`.

| Method and path | Purpose |
|---|---|
| `GET /health` | `{"status": "ok"}` |
| `GET /api/areas` | The modules with their labels, units and default targets |
| `GET /api/settings` | Read settings |
| `PUT /api/settings` | Replace settings (validated) |
| `POST /api/onboarding` | `{"modules": [...]}`: enable modules and set default targets (onboarding is finished by `PUT /api/settings` with `onboarded: true`) |
| `POST /api/sleep/suggestion` | `{"age", "role", "habits", "wake_time"}` (all optional): a suggested sleep goal or schedule; nothing is saved |
| `GET /api/days/{date}` | Read one day (`YYYY-MM-DD`); empty day if none |
| `PUT /api/days/{date}` | Save one day; blank or invalid numbers become `null` |
| `POST /api/days/bulk` | Merge numeric fields only; returns `{"saved", "skipped"}` |
| `GET /api/dashboard?date=YYYY-MM-DD` | Brief, area cards and habit grid, plus the 7 dates and each area's page details; date defaults to local today |
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
| `server/app/` | Python | API, rules (`areas.py`, `brief.py`, `lists.py`, `settings_rules.py`, `pages.py`), SQLite (`db.py`), security (`security.py`) |
| `server/tests/` | Python | pytest suite |
| `web/` | HTML, CSS, JS | `index.html`, `styles.css`, `js/` (`app.js`, `render.js`, `route.js`, `api.js`); `preview.html` is a static design preview |
| `web/tests/` | JS | `node:test` tests for the renderers |
| `tools/importer/` | Java | CSV importer, parked until v2 |
| `start.py` | Python | one-command launcher |
| `docs/` | Markdown | product spec and QA checklist |

## Project status

| Part | State |
|---|---|
| Server: rules, database, REST API, security (Tasks 1-8) | Done |
| Web page, served by the server (Tasks 9-11) | Done; dark theme only for now |
| Java CSV importer (Task 12) | Built, then parked for v2 on 2026-11-08 with Movement |
| Launcher `start.py` (Task 13) | Done |
| QA pass (Task 13) | Done, except a Narrator pass on the Sleep, Study and Work pages, the menu and the module pages |
| Sleep onboarding page (2026-10-29) | Done; see `docs/superpowers/specs/2026-10-29-sleep-onboarding-design.md` |
| Study onboarding page (2026-11-04) | Done; see `docs/superpowers/specs/2026-11-03-study-onboarding-design.md` |
| Work onboarding screens (2026-11-09) | Done; see `docs/superpowers/specs/2026-11-08-work-onboarding-design.md` |
| Side nav and module pages (2026-11-12) | Done; see `docs/superpowers/specs/2026-11-12-side-nav-module-pages-design.md` |

**Later (v2):** TickTick and Google Calendar as data sources, and an optional AI assistant, built on the same server. Movement comes back here too, with steps read from another app; the Java CSV importer in `tools/importer/` is kept for that.

## Documentation

- [docs/product-spec.md](docs/product-spec.md): the original product spec. Parts are out of date: v1 stores data in SQLite on a local server instead of the browser's `localStorage`, and starts with `python start.py` instead of opening an HTML file.
- [2026-10-21-compass-v1-sdp.md](2026-10-21-compass-v1-sdp.md): the v1 implementation plan, with every rule, constraint and task.
- [FEATURES.md](FEATURES.md): features in build order.
- [docs/qa-checklist.md](docs/qa-checklist.md): manual checks before v1 is called done.

## License

Compass is released under the [MIT License](LICENSE).

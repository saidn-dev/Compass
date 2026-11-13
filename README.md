# Compass

A local, single-user life dashboard. You log a few numbers a day (sleep, study, work) and Compass reads your last seven days and tells you what to focus on next. Everything runs on your own computer.

> **Status: v1 done.** Every check in the [QA checklist](docs/qa-checklist.md) has passed except the Narrator checks, which still need a person.

## Features

| Feature | What it does |
|---|---|
| **Home** | A score chip per module, the Compass score (0-100) with a headline, today's brief, focus tasks, goals, notes and habits |
| **Module pages** | Sleep, Study and Work each get a page: this week's score on an arc gauge, today's log, the last 7 days and 12 weeks as bars, contributors to the score, and the module's goal or schedule |
| **Daily brief** | 3-4 rules-based sentences: the area furthest behind, one pattern, one action under 30 minutes |
| **Insights** | Weekly review against the week before, patterns from the last 4 weeks, and streaks |
| **Check-in** | Mood (1-5), tags for the day and a rest-day box; rest days lower that week's Study and Work targets |
| **Focus, habits, goals, notes** | Up to 3 tasks a day (yesterday's unfinished ones offered again), a 7-day habit grid, up to 3 goals, a daily note |
| **Your data** | Export to one JSON file, import it back, or delete everything |

Default targets: Sleep 7.5 h a night, Study 12 h a week, Work 16 h a week. **A blank is a gap, never zero:** a missing value never counts against you. Compass gives no medical or financial advice and makes no AI calls.

## Privacy

Compass talks only to its own server, with no CDN, web fonts or analytics. The server listens on `127.0.0.1` only, rejects foreign `Host` and `Origin` headers, accepts only JSON writes, and needs an `X-Confirm: delete-all` header to delete your data. Data lives in `compass.db`, which git ignores.

## Getting started

Needs Python 3.12. Node.js 21+ is only needed for the web tests.

```bash
git clone https://github.com/saidn-dev/Compass.git
cd Compass
python start.py
```

The first run creates `.venv` and installs the packages, then opens `http://127.0.0.1:8765/`. Options: `--port 8766`, `--no-browser`. Back up your data with **Settings → Export**.

### Demo data

After the first run, this starts a second copy on port 8770 with 12 weeks of made-up data in `demo.db` (your `compass.db` is not touched):

```bash
.venv\Scripts\python.exe tools\demo.py    # Windows
.venv/bin/python tools/demo.py            # macOS / Linux
```

### Tests

```bash
pip install -r server/requirements-dev.txt   # inside .venv
python -m pytest server/tests                # 482 tests
node --test "web/tests/*.test.js"            # 61 tests
```

While the server runs, `http://127.0.0.1:8765/docs` lists every API endpoint and lets you try them.

## Project layout

| Path | Contents |
|---|---|
| `server/app/` | FastAPI server, all rules, SQLite and security (Python) |
| `server/tests/` | pytest suite |
| `web/` | The page: `index.html`, `styles.css`, `js/` (vanilla JS) |
| `web/tests/` | `node:test` tests for the renderers and addresses |
| `tools/demo.py` | Demo data server |
| `tools/importer/` | Java CSV importer, parked until v2 |
| `start.py` | One-command launcher |

## Roadmap

- **v2:** TickTick and Google Calendar as data sources, an optional AI assistant, and Movement (steps read from another app, using the parked importer).
- **v3:** points, levels and avatars.

## Docs

[FEATURES.md](FEATURES.md) (features in build order), [docs/qa-checklist.md](docs/qa-checklist.md), the [design specs](docs/superpowers/specs/), the [v1 plan](2026-10-21-compass-v1-sdp.md) and the original [product spec](docs/product-spec.md) (partly out of date).

## License

[MIT](LICENSE)

# Compass online: design

> **On hold since 2026-11-19:** the GitHub Student Pack (the route to Azure for Students) isn't available yet. The focus timer went first instead, laptop-only; see `2026-11-19-focus-sessions-design.md`.

2026-11-17. Project 1 of 4 replacing TickTick: (1) online, (2) task list, (3) focus timer, (4) phone app.

## Why
Run focus sessions and log sleep on the phone while out, with the laptop off. Must cost $0 now; paying after graduation (~2 years) is acceptable.

## Done when
- Compass is on one HTTPS address, usable from laptop and phone with the laptop off.
- One password; each device stays signed in 30 days.
- All existing data moved over, nothing lost.
- Open pages refresh every 5 minutes, so changes show on the other device.
- Nightly automatic backup; Export in Settings still works.
- $0, and nothing can ever charge the user.

**Not in this project:** phone layouts, offline use and the offline queue (projects 3-4), tasks, timer, multiple users, password reset by email.
**Must never happen:** a charge or a card on file; data reachable without the password; data loss; the password or its hash in git (the repo is public).

## Approaches
1. Every device runs Compass, Cloudflare free plan as sync mailbox: free forever, but by far the most work (merging, Python in the phone browser). Not chosen.
2. Heroku via the Student Pack: simple, but needs a card on file and SQLite becomes Postgres. Not chosen.
3. **Azure for Students, one always-on Linux VM running Compass as it is (chosen):** $0, no card, SQLite and code unchanged; cost is looking after a small server and re-verifying student status yearly.

## Design
**Hosting.** One Azure VM, Ubuntu LTS, B2ats v2 or B2pts v2 (750 free hours a month = one VM; B1s is being retired). Address: the VM's free Azure DNS name (`<name>.<region>.cloudapp.azure.com`). Caddy in front for automatic HTTPS; uvicorn stays on `127.0.0.1:8765`. Firewall opens 443, 80 (certificate and redirect) and 22 (SSH key only). Compass runs as a systemd service under its own user. Code arrives by `git clone`; one update script does `git pull` and a restart.

**Server mode.** A config file on the VM (outside the repo) turns it on and names the public host. Then `security.py` accepts that host instead of `127.0.0.1`, keeping the Origin and JSON checks. Server mode refuses to start without a password set. Local mode (`start.py`, tests) is unchanged: `127.0.0.1`, no login.

**Login.** One password, set on the VM with a command that stores a `hashlib.scrypt` hash (salted) in a file readable only by the service user. `POST /api/login` sets a session cookie (random, HttpOnly, Secure, SameSite=Strict); a session lasts 30 days from the device's last use, renewed at most once a day (Claude's call: a fixed 30 days would ask for the password mid-use on the phone); sessions are stored in SQLite so Settings can offer "Sign out everywhere". All `/api` routes except login and `/health` answer 401 without a session; the page then shows a sign-in screen. 5 wrong passwords in 15 minutes from one address gives 429 until the window passes. Static files stay public (no data in them).

**Moving data.** Export on the laptop, Import on the server, compare Home and one module page. After that the laptop uses the online address too; the server is the only live copy. The laptop's `compass.db` is kept untouched as a fallback, and local mode (`start.py`) is for development only, so nothing is ever Imported twice (Import replaces everything). `start.py` prints a one-line reminder of this.

**Backups.** Nightly systemd timer copies the database with SQLite's backup API, keeping 14. Off-server copy is the user's Export; Settings shows the date of the last export as a weekly reminder.

**5-minute refresh.** One copy of the data, so devices just re-fetch: every 5 minutes while visible and on returning to the tab, without moving focus or wiping typed input.

**Staying at $0.** One VM, free sizes and the default disk, no other Azure services; a $1 budget alert; yearly renewal reminder in the SDP.

**Docs.** SDP: new decision note; local-only constraints become "local mode binds 127.0.0.1; server mode only via HTTPS on its host, after login"; the "TickTick is a data source, not rebuilt" decision is replaced. Reword `docs/product-spec.md` line 91 and the welcome line in `web/index.html` ("Everything stays on this laptop...") for server mode. README gets a "Running Compass online" section; QA checklist gets server-mode lines.

## User must do
0. Sign up for Azure for Students via the GitHub Student Pack, without a student email (unconfirmed; if it fails, revisit the approaches).
1. Run `az login` once on the laptop. Claude then creates everything with the Azure CLI (user's choice), explaining each step in plain words before running it; the steps are saved as a script so they can be repeated.
2. Type the password into the set-password command themselves.
3. Export on the laptop, Import on the server.

## Left to the builder
Deploy file layout, config format, sign-in screen look (current dark style), session and attempt tables (schema bump, old databases still load), and tests (login, 401, lockout, host check, no-password refusal, refresh not clobbering input). Existing 482 Python and 63 JS tests keep passing.

Sources (2026-11-17): [Azure for Students](https://azure.microsoft.com/free/students/), [Azure education FAQ](https://learn.microsoft.com/en-us/azure/education-hub/faq), [B1s retirement](https://learn.microsoft.com/en-us/answers/questions/5848521/b1s-sized-server-unavailable-for-needed-school-vm), [Heroku students](https://heroku.com/github-students).

# Compass v1 Features

Each feature lists what it needs first. Build top to bottom: a feature starts once everything under "Needs" is done. Details live in `2026-10-21-compass-v1-sdp.md`.

## Stage 1: Foundation
| Feature | Needs |
|---|---|
| Server runs and answers `/health` | nothing |
| Request protection (blocks other websites from the local API) | Server runs |
| Life areas and status rules (On track / Behind / No data) | nothing |
| Day entry cleaning (blank = gap, never 0) | Life areas |
| Database (save and load days and settings) | Day entry cleaning |

## Stage 2: Core logic
| Feature | Needs |
|---|---|
| Onboarding (pick up to 5 modules, default targets) | Life areas, Database |
| Focus tasks (max 3 a day) | Day entry cleaning |
| Habits and weekly completion | Day entry cleaning |
| Goals (max 3) | Database |
| Daily brief (3-4 sentences plus the numbers used) | Life areas, Onboarding, Database |

## Stage 3: API
| Feature | Needs |
|---|---|
| REST API (settings, days, dashboard) | Request protection, Database, Onboarding, Daily brief, Focus tasks, Habits, Goals |
| Export, import and delete-everything | REST API |

## Stage 4: Web page
| Feature | Needs |
|---|---|
| Page shell, themes (light, dark, system), safe text display | nothing |
| Onboarding screen | REST API, Page shell |
| Dashboard: brief and area cards | REST API, Page shell, Onboarding screen |
| Daily log form | Dashboard |
| Focus, habits and goals sections | Dashboard |
| Quick capture notes (autosave) | Daily log form |
| Settings screen (targets, theme, export, import, delete) | Dashboard, Export/import/delete |

## Stage 5: Extras
| Feature | Needs |
|---|---|
| Java CSV importer (steps, fasting) | REST API |
| One-command launcher (`python start.py`) | Server runs |
| QA pass and README update | Everything above |

## Done when
All tests pass, the QA checklist is signed off, and the app starts with one command and only talks to `127.0.0.1`.

## Later (v2, not in v1)
TickTick and Google Calendar data, AI assistant. These build on the same server.

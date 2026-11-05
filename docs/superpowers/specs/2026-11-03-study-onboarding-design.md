# Compass: a Study page in onboarding (design)

## Context
Study is the simplest area in Compass right now. People log study hours each day, the 7 days are added up, and the total is checked against a weekly target (12 h by default). Compass has no idea what the person is studying for or when it's due. Its only tip is a fixed sentence.

Sleep got its own onboarding page on 2026-10-29. Study is next. **The aim of this round is only to find out the person's study goal.** Tips, plans, milestones, habits and smaller steps will come later from an AI, built from these goals and the person's other modules. That's why this page asks only for facts people know straight away: what they're studying for, when it is, and how many hours a week they can give it.

An earlier idea, asking "what helps your studying work over time?", was dropped. It's hard to answer before using the app, and choosing between milestones, habits and steps is really making the plan, which is the AI's job.

**Who writes what:** Claude writes all of it, JS included. Afterwards Claude explains the code thoroughly enough that you could rebuild it from scratch (the same rule as the Sleep round).

## Goals
- A Study page in onboarding, shown only if Study was picked.
- On it, the person lists **what they're studying for**, 1 to 5 goals. Each goal has a name and an optional date. There's a **+ Add another** button.
- The first goal's name is required. Dates are optional.
- **Hours a week** for all study together, the existing weekly target, set on the same page.
- The Study card on the dashboard shows the nearest dated goal and how many days are left.
- The brief can mention the nearest dated goal.

## Next round (decided 2026-11-03)
Each module will get its own page, with a side nav to reach it. The homepage will show only the important things from each module. That round is a separate project, brainstormed after this one. The Study page will become the place to view and edit study goals after onboarding. So this round doesn't add goal editing to Settings, because it would be thrown away.

## Non-goals (this round)
- Tips, study plans, milestones, habits or smaller steps for Study. The AI does those later.
- Logging hours per goal or per course. Logging stays one daily "Study" hours number.
- Any link between study goals and the existing **Goals** feature (the 3 goals with a percent).
- Pages for Movement and Work.
- Editing study goals after onboarding. Until the Study page exists, they can only be set during onboarding. Settings keeps its current Study row (hours and rule) unchanged.
- Module pages and the side nav (next round).
- Any change to how Study's On track / Behind is decided (weekly hours vs the target, mode "up").

## Anti-goals (it fails even if it works, if...)
- The page feels like a chore. It's three plain fields per goal. Nothing on it asks people to analyse themselves.
- It asks for something Compass doesn't use yet.
- A goal with a passed date shows nonsense (negative days) or blocks saving.
- Data leaves the laptop. Compass stays 127.0.0.1-only.

## Constraints
- The architecture doesn't change: the Python server owns every rule, and the page only shows what the API returns. Days-left and the brief line are worked out in Python, with tests written first.
- A blank entry is a gap, never 0. A blank date means "no date".
- Plain HTML/CSS/vanilla JS. Dark theme only. Existing tokens and classes. Contrast of 4.5:1 or more.
- Every input has a label. Focus moves to each new step's heading, as it does now.
- No git. You review and commit.

## The onboarding flow
**Welcome -> Areas -> Sleep (if picked) -> Study (if picked) -> Targets (other picked areas, skipped if none are left) -> Habits -> Goals**

- "Step X of N" counts only the steps that apply. This works the same way it does for Sleep (`onboardingSteps()` in `web/js/app.js:100`).
- Targets skips Study as well as Sleep, because Study's hours are set on the Study page. With Sleep, Study and one other area picked, Targets shows only that other area. With only Sleep and Study picked, Targets is skipped.
- Back and resume work the same way as today. The Study page redraws from saved settings. With nothing saved, it shows one empty goal row.

## The Study page
```
Step 4 of 7 - Study
What are you studying for?

 Goal 1   [ Data Structures exam      ]   Date [ 12/12/2026 ]
 Goal 2   [ Linear Algebra            ]   Date [            ]  [Remove]
 [ + Add another ]
 Leave the date blank if there isn't one.

 Hours a week for all your studying   [ 12 ] h

 [Back]                                              [Next]
```
- Each goal row has a name (text, 100 characters max, the existing `Name` rule) and a date (an `<input type="date">`).
- **+ Add another** adds an empty row and moves focus to its name input. At 5 rows the button is hidden, and a short line says "Up to 5 goals."
- **Remove** appears on every row while there are 2 or more rows. It removes that row and moves focus to **+ Add another**. *(my call)*
- **No date:** a blank date field means no date, with the hint line under the list. The earlier sketch had a separate "No date" tick box. A blank field already says the same thing, with one control fewer. *(my call)*
- **Hours a week:** the existing Study target. It's pre-filled with the saved target, or 12 if none is saved. There's no "More is better / Stay under" choice here. Saving sends back the saved mode, or "up" if none is saved, so nobody's saved mode silently changes. The choice is still in Settings > Targets. *(my call)*
- **Next** checks, in this order, and shows the first problem in the step's error line:
  - Rows where both the name and the date are blank are dropped silently. *(my call)*
  - If no row has a name: "Tell Compass what you're studying for."
  - A row with a date but no name: "Give each goal a name, or remove it."
  - Hours must be a number above 0 and up to 168: "Hours a week must be between 0 and 168."
  - Then it saves the goals (in the order shown) and the hours, and moves on.
- **Past dates are allowed.** Someone might add an exam that already happened, or a date passes later. The dashboard and brief handle it, see below. *(my call)*

## Data changes
- **Settings** gets a new `study_goals: list[StudyGoal]`, at most 5, default `[]`.
  - `StudyGoal = {name: Name, date: "YYYY-MM-DD" | null}`. A date must pass the existing `check_date_key` (`server/app/models.py:65`). A blank string becomes null.
  - It's saved as a list from the start, so more fields or per-goal logging can be added later without breaking saved data.
- **"At least one goal" is a page rule, not a data rule.** The server accepts an empty list. This matters because people who already have Study turned on have no goals, and turning Study on in Settings saves before any goal exists. Requiring one on the server would make their next save fail. Only the Study page in onboarding requires one. *(my call)*
- Study goals stay saved when Study is unticked, and come back if it's ticked again. Sleep schedules work the same way. *(my call)*
- **Backups:** the new field is optional, so old backups still import. The schema version stays at 1. `_validate_backup` in `server/app/db.py` checks it like the rest of Settings.
- No change to Day, logging, or the Java importer.

## Days left (Python, `server/app/study.py`, new)
- `days_left(date, today)` returns whole days. Today is 0, tomorrow is 1, and yesterday is -1.
- `nearest_goal(goals, today)` returns the goal with the closest date on or after today. If every dated goal has passed, it returns the most recently passed one, but only up to **7 days after its date**. Goals more than 7 days past are ignored, so the "date passed" reminder stops by itself once exams are over. With no goal left to return, it returns None. *(my call)*
- The wording, used by both the card and the brief:

  | Days left | Text |
  |---|---|
  | 0 | today |
  | 1 | tomorrow |
  | 2 or more | in N days |
  | below 0 | date passed |

## Dashboard: the Study card
- The Study entry in `GET /api/dashboard` gets a new `goal` field: `{name, date, days_left}` for the nearest goal, or null. Other areas don't get the field.
- The card adds one line under the target, e.g. "Data Structures exam · in 12 days". For a passed date it says "Data Structures exam · date passed".
- With goals but none dated, the line shows the first goal's name only. With no goals, or only goals more than 7 days past, there's no line. *(my call)*
- Python sends the finished text with the goal (`{name, date, days_left, text}`), so the page doesn't word anything itself.
- The card's `aria-label` includes the same text.

## Brief
- When Study is picked and `nearest_goal` finds a goal, the brief can add one line:
  - Upcoming: "Data Structures exam is in 12 days." ("...is today." / "...is tomorrow.")
  - Passed: "The date for Data Structures exam has passed." It doesn't point to Settings, because goals can't be edited there. The Study page will handle this next round.
- **If Study is the area the brief is about** (furthest behind or closest to target), this line replaces the "Lowest was..." pattern sentence, the same way the bedtime line does for Sleep.
- **Otherwise** it's added after the action sentence, if there's room.
- **The brief never goes over 4 sentences.** When lines compete for the last slot, the order is:
  1. the low-sleep warning
  2. an **upcoming** study line
  3. the bedtime line
  4. a **passed** study line

  An upcoming deadline is more urgent than a bedtime streak, and a passed one is less urgent. This is a small change to today's behaviour, where the bedtime line always takes the 4th slot when there's no warning. *(my call)*
- With nothing logged at all, the brief stays the single "Log today's numbers..." sentence, with no study line.
- The line's numbers go in "Numbers used" (facts) as `{area_id: "study", kind: "deadline", name, date, days_left}`.

## Settings
- No change. Settings > Targets keeps its Study row (hours and "More is better / Stay under"), and it saves exactly as today. Saving there keeps the study goals untouched, because the page sends the whole settings object back.
- The goal renderer takes an id prefix (`onb` now), so the Study page can reuse it next round without id clashes.

## Files expected to change
- `server/app/study.py` (new): days left, nearest goal, wording.
- `server/app/models.py`: `StudyGoal`, Settings `study_goals`.
- `server/app/brief.py`: the study line and the new order for the last slot.
- `server/app/dashboard.py`: the `goal` field on the Study area.
- `server/app/db.py`: backup validation, if it lists Settings fields.
- Tests in `server/tests/`: `test_study.py` (new), plus test_models, test_brief, test_api and test_db.
- `web/index.html`: the Study step.
- `web/styles.css`: goal rows, near the onboarding sleep styles.
- `web/js/render.js`: `renderStudyGoals(settings, prefix)` and the card's goal line, plus `skip: ["sleep", "study"]` on the onboarding Targets step only. Tests in `web/tests/render.test.js`.
- `web/js/app.js`: the Study step in `ALL_STEPS` / `onboardingSteps()`, add/remove rows, and reading and checking the page.
- `web/preview.html`: an example Study card with a goal line.
- Docs: `docs/areas/study.md` (new, like `sleep.md`), `docs/qa-checklist.md`, `README.md`, `FEATURES.md`, and the SDP data-model and API sections with a short dated note.

## After the build
Claude explains the code in build order: data, then rules, API, HTML, CSS, render.js, then app.js. Each piece gets what it does, why, and how to rebuild it from scratch.

## Verification
- `.venv/Scripts/python.exe -m pytest server/tests`: all green, including new tests:
  - days left for today, tomorrow, N days and passed dates
  - nearest goal: upcoming beats passed, the closest upcoming wins, all passed gives the latest within 7 days, 8+ days past or none dated gives None
  - Settings with 0 and 5 goals accepted, 6 rejected, bad dates rejected, a blank date becomes null
  - the brief line when Study is the focus (replaces the pattern), when it isn't (added), and the 4-sentence order with the low-sleep warning and bedtime line
  - the dashboard `goal` field
  - an old backup without `study_goals` still imports
- `node --test "web/tests/*.test.js"`: all green, including the goal-row renderer (1 row, 5 rows with no add button, escaping) and the card goal line.
- The headless-Edge browser script from the Sleep round, against a **scratch database** on port 8766 so your real `compass.db` is untouched. New scenarios:
  - Study picked alone, with Sleep, and with Sleep plus another area (the step list and "Step X of N")
  - add rows up to 5, remove rows, focus after each
  - each Next error message
  - Back and resume redraw the saved goals
  - the card line for upcoming, today, passed and undated goals
  - "Save targets" in Settings still works with Study on and no goals, and leaves saved goals untouched
  - Study unticked then ticked again keeps the goals

  It also records console errors and request hosts (`127.0.0.1` only), and takes screenshots at 1280 px and 360 px. The existing Sleep scenarios still pass.
- You do a short Narrator pass on the Study page: row labels, Add and Remove, and focus.
- The QA checklist gets new Study items, ticked with how they were checked.

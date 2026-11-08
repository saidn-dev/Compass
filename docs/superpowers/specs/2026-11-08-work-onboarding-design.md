# Compass: Work pages in onboarding (design)

## Context
Compass is meant to work for anyone, not just its first user. Work is the area where people differ the most: someone in a 9-to-5 job, a freelancer, a student with a side job and someone looking for work all want different things from it. Right now Work is a bare number, "paid hours per week, target 16 h, more is better", which fits some of them and is wrong for others. Someone in a full-time job usually wants to work *less*, not more.

Sleep (2026-10-29) and Study (2026-11-04) each got their own onboarding page. Work is next, and it is the last area: Movement was taken out of v1 on 2026-11-08.

The questions came from you. One rule decided which ones stay: **Compass only asks what it can act on today.** v1 has no AI, so every answer has to change a target, the Work card, or the brief's advice. "How should Compass help you?" was dropped for this reason: reminders and a weekly review don't exist, so asking would make a promise Compass can't keep.

**Who writes what:** Claude writes all of it, JS included, then explains the code thoroughly enough that you could rebuild it from scratch (the same rule as the Sleep and Study rounds).

## Goals
- When Work is picked, onboarding shows **six Work screens, one question each**, with Back, Skip and Next.
- The answers set the Work target (hours and direction), show on the Work card, and pick the brief's Work tip.
- **Settings gets a Work section** where all six answers can be changed later.
- It reads sensibly for every kind of worker: employed, freelance, student who works, job hunting, other.

## Non-goals (this round)
- Redesigning "On track / Behind". You've said it is too fixed and will change later. This round keeps it as it is.
- "How should Compass help you?" and anything it implied: reminders, deadlines, weekly reviews.
- Changing how Work is logged. It stays one "hours" number a day.
- A different log field or unit for job hunters, such as applications sent. They log hours spent searching.
- Changes to the Sleep or Study pages, or splitting them into one question per screen.
- The module pages and side nav planned in the Study design.
- Putting the 3-month goal into the 3 **Goals** (the ones with a percent).

## Anti-goals (it fails even if it works, if...)
- It reads as if it was written for one kind of worker, e.g. telling someone with a full-time job to work more.
- It asks something Compass then ignores.
- Six screens feel like a chore. Each one is a single quick answer and can be skipped.
- Skipping leaves Work broken. Skipping everything gives exactly today's Work: 16 h a week, more is better.
- Data leaves the laptop. Compass stays 127.0.0.1-only.

## Constraints
- The architecture doesn't change: the Python server owns every rule (target, tip, card text), and the page only shows what the API returns. Rules are written test-first.
- A blank entry is a gap, never 0.
- Plain HTML/CSS/vanilla JS, existing tokens and classes, dark theme only, contrast of 4.5:1 or more.
- Every input has a label. Focus moves to each new screen's heading, as it does now.
- No git. You review and commit.

## The onboarding flow
**Welcome -> Areas -> Sleep (if picked) -> Study (if picked) -> Work (if picked: 6 screens) -> Habits -> Goals**

- **The Targets step leaves onboarding.** Every area now has its own page, so it would never have anything to show. *(my call)*
- **Work counts as one step** in "Step X of N", so the count doesn't jump to 12. Each Work screen also shows a smaller "Work · 2 of 6" line under it. *(agreed)*
- With nothing picked yet, the count is Welcome, Areas, Habits, Goals = "Step 1 of 4", and it grows once areas are picked, as it does today.
- **Next** checks the answer, saves it (one `PUT /api/settings`, like the other steps), then moves on. **Skip** moves on without changing what's saved for that screen. **Back** goes to the previous screen; from Work screen 1 it goes to the previous step, and Back from Habits goes to Work screen 6. *(my call)*
- Resume works as it does today: reloading starts at Welcome, and every Work screen redraws from saved settings.

## The six Work screens
Every screen: a heading (the question, which gets focus), the control, an error line, and Back / Skip / Next.

**1. "What best describes your work right now?"** Radio buttons: Employed · Freelance or self-employed · Student who works · Looking for work · Other.
- This sets the **direction** of the Work target: **Employed** means "Stay under" (`limit`), and every other answer means "More is better" (`up`). *(agreed)*
- The mode only changes when this screen is answered. Skipping it keeps the saved mode, or `up` if none is saved.
- "Looking for work" logs hours spent searching in the same Work field (see Log form below). *(my call, agreed in chat)*

**2. "What's your role or main kind of work?"** One text field, 100 characters max (the existing `Name` rule). Hint: "For example: Software developer, Nurse, Barista." Optional; blank means none. Shown on the Work card.

**3. "Which days and hours do you usually work?"**
```
 Days   [Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun]     (toggle buttons, aria-pressed)
 From   [09:00]   To   [17:00]
 = 40 h a week                                          (updates as you type)

 [ ] It varies
     Hours a week  [ 16 ] h                             (shown only when ticked)
```
- **A schedule:** at least one day, a start and an end time. The week's hours are days × the hours between the two times. An end time earlier than the start means a shift past midnight (22:00 to 06:00 is 8 h), the same rule as Sleep's bedtime and wake time (`hours_between` in `server/app/sleep.py`). One time range covers every chosen day. Different hours on different days count as "It varies". *(my call)*
- **With a schedule saved, the Work target is always worked out from it**, the same way a Sleep schedule sets the sleep target (`sync_sleep_target` in `server/app/settings_rules.py`). The result must be above 0 and at most 168.
- **"It varies":** the schedule controls hide and one "Hours a week" box shows, pre-filled with the saved Work target or 16. It saves as the Work target, sets `hours_vary` to true, and clears any saved schedule. Saving a schedule sets `hours_vary` back to false. Redrawing (Back, resume, Settings) ticks "It varies" only when `hours_vary` is true; an unanswered screen opens on the empty schedule controls. *(my call, after the builder check)*
- Messages on Next: "Pick at least one day." · "Enter a start and end time." · "Start and end can't be the same." · "Hours a week must be between 0 and 168."

**4. "When do you do your best focused work?"** Radio buttons: Morning · Afternoon · Evening · It varies. Used in the brief's Work tip.

**5. "What's the one work goal that matters most in the next 3 months?"** One text field, 100 characters max. Hint: "For example: Fix 3 bugs." Optional. Shown on the Work card. It has no date. *(agreed)*

**6. "What usually gets in the way of your work week?"** Checkboxes, any number: Unclear priorities · Putting things off · Interruptions · Low energy · Too many projects · Something else. This picks the brief's Work tip.

## Data changes
- **Settings** gets a new `work: WorkProfile`, defaulting to an empty profile:
  ```
  WorkProfile {
    kind:      "employed" | "freelance" | "student" | "job_hunting" | "other" | null
    role:      Name | null            (blank becomes null)
    schedule:  { days: [0-6] (1-7 distinct, Monday = 0), start: "HH:MM", end: "HH:MM" } | null
    hours_vary: bool                (true when "It varies" was ticked; then schedule is null)
    focus:     "morning" | "afternoon" | "evening" | "varies" | null
    goal:      Name | null
    derailers: list of "priorities" | "procrastination" | "interruptions" | "energy" | "projects" | "other", no repeats, kept in screen order
  }
  ```
- `sync_work_target(settings)`, next to `sync_sleep_target`: with a schedule and Work picked, the Work target = days × hours. With `kind` set, the mode is `limit` for employed and `up` for anything else. It runs wherever `sync_sleep_target` runs today (`check_settings`, `apply_onboarding`, and loading or importing settings).
- **Work leaves the target rows in Settings > Targets**, the same way Sleep and Study already do (`skip: OWN_PAGE` in `web/js/app.js`). Its hours and direction are set in Settings > Work instead. *(my call: one place for each value)*
- **The Settings > Targets panel stays.** It also holds Sleep's goal-or-schedule controls (`#settings-sleep` inside `#targets-form`), and Sleep is out of scope this round. With Work gone from it, it shows only Sleep's controls when Sleep is picked, and the whole panel is hidden when Sleep isn't. *(my call, after the builder check)*
- The profile stays saved when Work is unticked, and comes back if it's ticked again, the same as Sleep schedules and study goals. *(my call)*
- **Backups:** the field is optional, so old backups still import. The schema version stays at 1.
- No change to Day.

## The brief's Work tip
Today the third sentence of the brief is the area's fixed `suggestion`. For Work, it becomes `work_tip(profile, mode)` in a new `server/app/work.py`.

`work_tip` checks in this order, using the saved Work **mode** (not `kind`) so it also covers people who set "Stay under" before this round: *(my call, after the builder check)*
1. **Mode `limit`:** "Pick a time to stop work today and keep to it." The other tips are about doing *more*, which is the wrong advice here. *(my call)*
2. **Mode `up` with a derailer:** the tip for the **first** derailer ticked (in screen order), with the focus time filled in. *(agreed)*
3. **Otherwise** (no derailer, only "Something else", or an empty profile): the general tip, with the focus time filled in.

  | Derailer | Tip |
  |---|---|
  | (none) | Block 30 minutes {when} for your most urgent task. |
  | Unclear priorities | Pick the one task that matters most this week and give it 30 minutes {when}. |
  | Putting things off | Spend 10 minutes {when} on the task you've been putting off. |
  | Interruptions | Turn off notifications for one 30-minute block {when}. |
  | Low energy | Do 30 minutes on your hardest task {when}, then take a short break. |
  | Too many projects | Choose one project to move forward {when} and leave the rest for now. |

  `{when}` is "in the morning", "in the afternoon" or "in the evening" from screen 4, and "today" for "It varies" or no answer. *(tip wording is my call; you may want to rewrite it)*
- With an empty profile the general tip reads "Block 30 minutes today for your most urgent task.", nearly today's sentence, so skipping everything changes almost nothing. The area's fixed `suggestion` in `areas.py` is updated to this same sentence. *(my call: one rule instead of a special case)*
- The tip appears where the suggestion does today: only when Work is the area the brief is about. No new sentence, so the 4-sentence limit and its order are unchanged.

## Dashboard: the Work card
- The Work entry in `GET /api/dashboard` gets the same `goal` field Study has, carrying `{text}` (Python writes the text). The page already draws `area.goal.text` as a line under the target, and adds it to the card's `aria-label` (`renderAreaCard` in `web/js/render.js`), so the card needs no new markup. *(my call)*
- The text is the role and the goal joined by " · ", e.g. "Software developer · Goal: Fix 3 bugs". With only one of them, just that one. With neither, `goal` is null and there's no line.

## Log form
- The Work field's label follows `kind`: "Job search" for job hunting, otherwise "Paid work" as today. *(my call)*
- Logging is otherwise unchanged: one hours number a day, 0 to 24.

## Settings: the Work section
- A **Work** panel like Settings > Study (`settings-study-panel` in `web/index.html`), shown only with Work picked. It has all six questions on one form (not six screens), using the same controls and the same messages, and one **Save work** button with a "Saved" status. This is where Work's hours and direction are changed from now on: the work type sets the direction, and the days and hours (or "It varies" hours) set the target.
- Turning Work on in Settings doesn't open the six screens. The empty profile works (today's defaults), and the person can fill in the Work section when they like.

## Files expected to change
- `server/app/work.py` (new): weekly hours from a schedule, the tip, the card text.
- `server/app/models.py`: `WorkSchedule`, `WorkProfile`, Settings `work`.
- `server/app/settings_rules.py`: `sync_work_target`, called wherever `sync_sleep_target` is.
- `server/app/brief.py`: the Work tip in place of the fixed suggestion.
- `server/app/dashboard.py`: the `goal` field on the Work entry.
- `server/app/db.py`: run the Work sync on load and import, as Sleep does.
- Tests in `server/tests/`: `test_work.py` (new), plus test_models, test_settings_rules, test_brief, test_api and test_db.
- `web/index.html`: the six Work screens, the Settings Work panel; the onboarding Targets step removed.
- `web/styles.css`: the day toggle buttons and the "= 40 h a week" line, near the onboarding sleep styles.
- `web/js/render.js`: renderers for the Work screens and the Settings Work form (taking an id prefix, like `renderStudyGoals`). `renderTargetRows` stays (Settings > Targets still calls it, now with nothing left to list but kept for future areas). Tests in `web/tests/render.test.js`.
- `web/js/app.js`: Work in `onboardingSteps()` with its six sub-screens, "Work · N of 6", Next/Skip/Back, checking and saving each screen, the Settings Work form, the log label; the onboarding Targets step removed; the Settings Targets panel hidden when Sleep isn't picked.
- `web/preview.html`: an example Work card with its line.
- Docs: `docs/areas/work.md` (new, like `study.md`), `docs/qa-checklist.md`, `README.md`, `FEATURES.md`, the SDP data-model section with a short dated note.

## After the build
Claude explains the code in build order: data, then rules, API, HTML, CSS, render.js, then app.js. Each piece gets what it does, why, and how to rebuild it from scratch.

## Verification
- `.venv/Scripts/python.exe -m pytest server/tests`: all green, including new tests:
  - weekly hours: Mon–Fri 09:00–17:00 is 40; an overnight shift; one day; 7 days × 24 h is rejected (over 168); 0 days, repeated days and equal times are rejected
  - target sync: a schedule sets the target; `kind` sets the mode; employed gives `limit`; no profile changes nothing; Work unticked leaves the target alone
  - the tip for each derailer, for each `{when}`, for "Something else" only, for `limit` (with and without a profile), and for an empty profile
  - the card text with role only, goal only, both, and neither
  - an old backup without `work` still imports, and a saved profile survives export and import
- `node --test web/tests/*.test.js`: all green, including the Work screen renderers (saved answers redrawn, escaping).
- A browser script against a **scratch database** on port 8766, so your real `compass.db` is untouched:
  - Work alone, and with Sleep and Study: the step list, "Step X of N" and "Work · N of 6"
  - each screen's Next message; Skip on every screen gives 16 h, more is better, and the general tip
  - employed + Mon–Fri 9–5: the card says "Limit 40 h"; freelance: "Target 40 h"
  - "It varies" saves the typed hours and clears a saved schedule
  - Back through all six screens and back from Habits; reload redraws every answer
  - the card line; the log label for job hunting; Settings > Work saves, changes the card's target and direction, and keeps the other areas' settings
  - console errors, request hosts (127.0.0.1 only), screenshots at 1280 px and 360 px
  - Sleep and Study onboarding still work with the Targets step gone, and Settings > Targets still saves Sleep's goal or schedule
- You do a short Narrator pass on the Work screens: headings, the day buttons, "It varies", and focus.
- The QA checklist gets new Work items, ticked with how each was checked.

# Compass: a Sleep page in onboarding (design)

## Context
Right now onboarding asks for every target on one shared "Your targets" page, as a bare number. You want each area to get its own onboarding page, starting with **Sleep**. The Sleep page should find out whether the person already knows what they want from their sleep, or needs help working it out. Logging should then match what they chose: someone with set bed and wake-up times logs those times, and Compass works out the hours.

This is a project (server, page and daily log all change). So this document is the design. After you approve it, it goes into the repo and becomes a step-by-step build plan.

**Who writes what (your answer):** Claude writes all of it, JS included. Afterwards Claude explains the code thoroughly enough that you could rebuild it from scratch.

## Goals
- A Sleep page in onboarding with three choices:
  1. **I have a sleep goal**: hours a night.
  2. **I have a sleep schedule**: bedtime and wake-up time.
  3. **Let's work it out**: a few questions, then a suggestion they can change.
- Every "Let's work it out" question can be skipped.
- People with a schedule log **bedtime and wake time** each day. Compass works out the hours.
- People with only a goal keep logging **hours**, as they do now.
- The Sleep card's On track / Behind is still decided by **average hours vs the goal**. For schedule users, the brief also says how often they got to bed on time.

## Non-goals (this round)
- Pages for the other five areas. They stay on the shared targets page for now.
- Saving the "Let's work it out" answers. They're used once to make the suggestion, then dropped.
- "Let's work it out" in Settings. Settings only lets you switch between a goal and a schedule.
- Any change to how other areas are logged, scored or briefed.

## Anti-goals (it fails even if it works, if...)
- It reads like medical advice. Suggestions are general guidance, and the page says so.
- It asks for data Compass doesn't use. This is why the sex question was dropped.
- Skipping a question blocks the person or leads to a worse or broken result.
- Data leaves the laptop. Compass stays 127.0.0.1-only.

## Constraints
- The architecture doesn't change: the Python server owns every rule, and the page only shows what the API returns. Suggestion rules and hours-from-times live in Python, with tests written first.
- A blank entry is a gap, never 0. This applies to the new time fields too.
- Plain HTML/CSS/vanilla JS. Dark theme only. Existing tokens and classes. Contrast of 4.5:1 or more.
- Every input has a label. The radio choices use a fieldset and legend. Focus moves to each new step's heading.
- No git. You review and commit.

## The onboarding flow
**Welcome -> Areas -> Sleep (only if Sleep was picked) -> Targets (other picked areas only, skipped if none are left) -> Habits -> Goals**

- "Step X of N" counts only the steps that apply, recounted after Areas is saved. Before that it assumes the saved picks, or 5 steps for a fresh start. *(my call)*
- Back and resume work the same way as today. The Sleep page redraws from saved settings.

## The Sleep page
```
Step 3 of 6 - Sleep
Do you already know what you want from your sleep?

 ( ) I have a sleep goal        Hours a night [ 7.5 ] h
 ( ) I have a sleep schedule    In bed [22:30]  Up [06:30]   = 8 h a night
 ( ) Let's work it out

 +- Let's work it out --------------------------------------+
 | Answer what you like. Anything you skip is left out.     |
 | Age                        [Skip v]                      |
 | What best describes you    [Skip v]                      |
 | Habits that affect sleep   [ ] Alcohol [ ] Late caffeine |
 |                            [ ] Screens in bed ...        |
 | Earliest weekday wake time [--:--]                       |
 |                                  [ Show my suggestion ]  |
 +----------------------------------------------------------+
 Your suggestion (change anything)
  Hours a night [ 8 ] h      In bed by [22:30]  Up at [06:30]
  Tip: Stop drinking alcohol about 3 hours before bed.
  General guidance, not medical advice.

 [Back]                                              [Next]
```
- Only the fields for the chosen option are shown. The schedule option shows the hours it works out to as you type.
- **How skipping works** *(my call)*: each question is optional. The two selects start on "Skip", the wake time can be left blank, and the habits can be left unticked. Skipping any or all of them still gives a suggestion.
- **Questions:**
  - **Age** brackets: Under 18, 18-25, 26-64, 65+.
  - **What best describes you**: Student, Employed, Self-employed, Shift worker, Unemployed, Other.
  - **Habits** *(my call on the list)*: Alcohol, Caffeine after midday, Screens in bed, Long or late naps, Heavy meals late, Nicotine.
  - **Earliest weekday wake time**.
- **Next** saves:
  - Goal: the sleep target becomes that number of hours, and there's no schedule.
  - Schedule: the schedule is saved, and the target becomes the gap between the times.
  - Let's work it out: what the suggestion shows when they press Next.
    - When the suggestion includes a schedule, it shows the two times and the hours they make, like the schedule option does. It's saved as a schedule.
    - Otherwise it shows the hours input and is saved as a goal.
    - Pressing "Show my suggestion" again recalculates it. Pressing Next before the first "Show my suggestion" shows a message asking them to press it first.
- **Coming back** (Back, resume, or a later visit): the page opens on the schedule option with its times if a schedule is saved. Otherwise it opens on the goal option with the saved sleep target. *(my call)*
- Validation messages, in the same style as other steps:
  - The goal must be a number above 0 and up to 24.
  - The two times must be different.

## Suggestion rules (Python, `server/app/sleep.py`, new)
- **Hours by age** (general guidance, based on the US National Sleep Foundation ranges):

  | Age | Range | Pre-filled |
  |---|---|---|
  | Under 18 | 8-10 h | 9 |
  | 18-25 | 7-9 h | 8 |
  | 26-64 | 7-9 h | 8 |
  | 65+ | 7-8 h | 7.5 |
  | Skipped | 7-9 h | 8 |

  The range is shown next to the number.
- **Schedule**: bedtime = wake time - hours, wrapping past midnight (06:30 - 8 h = 22:30). It's only suggested when a wake time was given and the person isn't a shift worker.
- **Shift worker**: no schedule suggestion, and a note saying "Shift work makes a fixed schedule hard; an hours-a-night goal may suit you better." Only "Shift worker" changes the result. The other answers to that question are asked but have no effect for now.
- **One tip per ticked habit** *(my call on the wording; it's general, not medical)*:

  | Habit | Tip |
  |---|---|
  | Alcohol | Stop drinking alcohol about 3 hours before bed. |
  | Caffeine after midday | Have your last coffee or tea before 2 pm. |
  | Screens in bed | Put screens away 30 minutes before bed. |
  | Long or late naps | Keep naps under 30 minutes and before 3 pm. |
  | Heavy meals late | Finish big meals 2 to 3 hours before bed. |
  | Nicotine | Avoid smoking or vaping close to bedtime. |

- The disclaimer line is always shown.
- **API:** `POST /api/sleep/suggestion` with `{age?, role?, habits: [], wake_time?}` returns `{hours, range, bedtime?, wake_time?, tips: [], notes: []}`. Nothing is saved. Unknown values give a 422 in the existing error shape.

## Data changes
- **Settings**: a new `sleep_schedule: {bedtime: "HH:MM", wake_time: "HH:MM"} | null` (default null). `check_settings` rejects bad times or equal times. When a schedule is set, it sets the sleep target to the gap between the times (mode "up"), so the two can never disagree.
- **Day**: new `bedtime` and `wake_time` fields ("HH:MM", or null as a gap).
  - In `normalize_day`, anything that isn't a valid time becomes null.
  - When both times are present, `sleep_hours` is worked out from them (rounded to 0.01) and replaces any hours that were sent. Wrapping past midnight works (23:00 -> 06:30 = 7.5). Equal times give a gap.
  - A night belongs to the day you wake up, so the log says "Last night". *(my call)*
- Because `sleep_hours` is still filled in, the area card, trend, status and existing brief need no change.
- Backups: the new fields are optional, so old backups still import. The schema version stays at 1. *(my call)*
- The Java importer is unchanged. It can send `sleep_hours` (`--field sleep_hours`). On a day that already has bed and wake times, those hours are skipped with the reason "This day's sleep comes from its bed and wake times." (found in the final review, 2026-10-29).

## Daily log
- People with a schedule see a "Last night" pair of labelled time inputs instead of the Sleep hours input: "In bed" and "Up".
- Everyone else sees the hours input as now.
- A blank time is a gap.

## Brief (schedule users only)
- One line, e.g. "In bed after 22:30 on 3 of 6 nights." When every night was on time it says "In bed by 22:30 on all 6 nights." Getting to bed up to 30 minutes after the planned bedtime counts as on time, and this works past midnight.
- It only appears when 4 or more nights have a bedtime logged.
- If Sleep is the area the brief is about, the line replaces the "Lowest was..." sentence. Otherwise it's added after the action sentence.
- The brief never goes over 4 sentences. The existing low-sleep warning wins over the schedule line.
- The numbers it uses go in "Numbers used" (facts). *(my call)*

## Settings
- The Sleep row in Settings > Targets becomes the same goal-or-schedule choice, but without "Let's work it out". *(my call)*
- Existing bug fixed along the way: the onboarding targets and the Settings targets draw inputs with the same ids (`target-sleep` and so on). The Settings labels then point at the hidden onboarding inputs (`web/js/render.js:171`). The fix gives each place its own id prefix.

## Files expected to change
- `server/app/sleep.py` (new): suggestion rules and time helpers.
- `server/app/models.py`: Day time fields, Settings `sleep_schedule`.
- `server/app/settings_rules.py`: schedule check and target sync.
- `server/app/brief.py`: the bedtime line.
- `server/app/routes.py`: the suggestion endpoint.
- Tests in `server/tests/` (`test_sleep.py` new, plus test_models, test_settings_rules, test_brief, test_api).
- `web/index.html`: the Sleep step, the log time fields, the Settings sleep row.
- `web/styles.css`: the onboarding section near line 269.
- `web/js/render.js`: sleep choice and suggestion renderers, the id prefix in `renderTargetRows`. Tests in `web/tests/render.test.js`.
- `web/js/api.js`: `getSleepSuggestion`.
- `web/js/app.js`: dynamic steps, the Sleep step, log and Settings handling.
- Docs: `docs/qa-checklist.md`, `README.md` (features and status), `2026-10-21-compass-v1-sdp.md` (API table line 133 plus a short dated note), `FEATURES.md`.

## After the build
Claude explains the code in build order: data, then rules, API, HTML, CSS, render.js, then app.js. Each piece gets what it does, why, and how to rebuild it from scratch.

## Verification
- `.venv/Scripts/python.exe -m pytest server/tests`: all green, including new tests:
  - hours from times, with midnight wrap and equal times giving a gap
  - suggestion per age bracket and with everything skipped
  - shift-worker note and habit tips
  - schedule sets the target
  - bedtime line, including the 30-minute grace past midnight
- `node --test "web/tests/*.test.js"`: all green, including the new renderers and the id prefix.
- A headless-Edge browser script against a **scratch database** on port 8766, so your real `compass.db` is untouched. It runs each Sleep path:
  - goal
  - schedule
  - work it out with everything answered
  - work it out with everything skipped
  - work it out as a shift worker

  It also covers no Sleep picked (no Sleep page) and only Sleep picked (no Targets page), the "Step X of N" labels, Back and resume, the log showing times vs hours, the brief line after 4 logged nights, the Settings switch, and the 8 open onboarding checks from `docs/qa-checklist.md`. It also records console errors and request hosts (`127.0.0.1` only), and takes screenshots at 1280 px and 360 px.
- You do a short Narrator pass on the Sleep page (radio group, time inputs, suggestion read out).
- The QA checklist gets new Sleep items, ticked with how they were checked.

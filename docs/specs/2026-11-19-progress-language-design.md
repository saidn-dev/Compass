# Progress language from Opal and Oura: design

2026-11-19. Built on top of v2 stage 1 (focus sessions) in the `focus-sessions` worktree. Research: `Sherlocks-Research/2026-11-19-opal-app-design-teardown.md` and `2026-11-19-oura-app-design.md`.

## Why
Compass should tell you how you're doing the way the best trackers do: one number with a word, the reason next to it, compared with your own normal, never shaming. It should also start you off with an honest picture and a first focus session.

## What the user asked for (2026-11-19)
- Onboarding: an honest estimate turned into a projection, labelled "estimate". The first focus session starts before onboarding ends.
- Baseline: compared with your own 14-day average against your 2-3-month normal, with "Learning your rhythm, day 4 of 14" at the start, and your normal range next to the current value.
- Graded streaks (flicker, lit, fade, revive) with a holiday or exam shield instead of a streak that breaks.
- Tone: what happened, then an offer, then a gentle limit. A Supportive or Direct setting. Never shame.
- Score bands: 85+ Optimal, 70-84 Good, 60-69 Fair, under 60 Pay attention. Contributors use the same words.
- **Great / Ok / Too much** replaces On track / Behind. It applies only to limits (decided: up-goals use the bands only).
- A weekly Focus Report that unlocks after 7 days: best and worst day, this week against your starting point, time reclaimed.
- Pace for study goals with a date: "At this pace you'll reach X by Thu 27 Nov, 2 days late. 30 more min a day closes it."
- The top reason next to the gauge.
- Avoid: history behind a paywall (Compass has none), scores with no explanation, and updates that wipe a setup or hide the number people track.

## Rounds (built in this order)
1. **Words:** bands, Great/Ok/Too much, the top reason, tone and its setting.
2. **Your normal:** the 14-day/12-week comparison, usual range, learning period.
3. **Over time:** graded streaks with shields, the weekly Focus Report, goal pace.
4. **Onboarding:** the estimate, the projection, the first session.

## Design

### Round 1: words
- `SCORE_BANDS`: 85 Optimal "Right on course", 70 Good "Close to course", 60 Fair "Drifting a little", 0 Pay attention "Off course". PRODUCT.md's "Compass keeps 100/85/70" line is replaced.
- **Limits** (an area in limit mode, e.g. Work for someone employed): the level is `Great` (at or under the limit, score 100), `Ok` (up to 15% over, score 85-99) or `Too much` (more). Headlines: "Within your limit", "A little over", "Well over your limit". The Bedtime contributor is a limit too: no late nights Great, 1-2 Ok, 3 or more Too much.
- `status` (On track / Behind / No data) is removed from the dashboard and the page. The level word does its job.
- The Hours contributor's text gains its target: "4 of 10 h this week", "6.5 of 7.5 h a night on average".
- **Top reason** (`reason`): for each area, the weakest contributor that isn't at the top level, e.g. "Mostly hours: 4 of 10 h this week". For the Compass score, the weakest area: "Mostly Study: 4 of 10 h this week". None when everything is at the top. Shown in the hero's status line next to the level word.
- **Tone** (`Settings.tone`: `supportive` default, or `direct`). The brief keeps its shape (what happened, a pattern, the tip, extras, at most 4 sentences).
  - Supportive: "Study is furthest from its target: 4 h this week against 10 h." and the tip as an offer with a gentle limit: "If it feels right, do one 30-minute study block on your nearest deadline, but there's no need to make up the whole week today."
  - Direct: "Study: 4 h this week against 10 h, 6 h short." and the tip as it is.
  - The word "behind" leaves the brief. Settings gets a Tone choice.

### Round 2: your normal
- `server/app/baseline.py`. Learning: the days since your first logged day (any module or a session), counted from 1. Up to day 14 the area reads "Learning your rhythm · day N of 14", which replaces the headline, and no usual range is shown. The score and level still show (the target is yours, so it's honest).
- From day 15: **recent** is the last 14 days (an average a night for Sleep, an average a week for Study and Work). **Usual** is the last 12 weeks: the middle half (25th to 75th percentile) of nightly values for Sleep, or of weekly totals for Study and Work (weeks with nothing logged left out). It needs 7 logged nights or 2 logged weeks.
- Line under the hero: "Last 14 days: 9 h a week · your usual 8-11 h · Within your usual" (or "Above your usual ▲" / "Below your usual ▼"). Home's hero shows the learning day when any area is still learning.
- The 12-week chart shades the usual range.

### Round 3: over time
- **Streaks** (Logging, Bedtime on time, each habit). Rest days and shield days are skipped: they neither count nor break.
  - One missed day doesn't end a streak: the streak **fades** and is **revived** if the next day is done. Two missed days in a row end it.
  - States: `lit` (done today), `flicker` (not done yet today, alive), `fade` (missed the last day, do it today to revive), `out` (no streak).
  - Text: "12 days · lit", "12 days · do it today to keep it lit", "Fading · do it today to revive 12 days", "Start again today". Revives are counted: "revived 2 times".
- **Shields** (`Settings.shields`: up to 20 `{start, end, reason}`, reason `holiday` or `exam`). Insights has "Pause streaks": reason and an end date, from today. An active shield shows with "End now". Shields only pause streaks; they don't lower targets (an exam week usually means more study, not less).
- **Starting point** (`Settings.starting_point`: `{date, study_hours, work_hours}`, the weekly estimates from onboarding; either can be null). For someone onboarded before this, the date is their first logged day and the estimates are null.
- **Focus Report** on Insights (focus = Study + Work hours, sessions included). Locked until 7 days after the starting date: "Your first Focus Report unlocks on Wed 26 Nov · day 3 of 7". Then:
  - "This week: 14 h of focus", with best and worst day.
  - Against your starting point: "+3 h a week over your estimate of 11 h" (or against your first 7 days when there's no estimate).
  - Time reclaimed: the sum, over the weeks since the start, of focus above the starting pace: "Since you started: 9 h reclaimed". Never negative; a week under the start adds nothing.
- **Goal pace.** A study goal gains optional `hours` (how many it needs). Sessions count toward a goal when their task is the goal's name: the Study timer's task picker lists study goals as well as today's tasks. Pace = that goal's session hours over the last 14 days, per day. Lines (on the Study page under each goal; built 2026-11-19 without the brief line, because the brief shows only numbers that are in its "Numbers used" facts, and a projected date isn't one):
  - "At this pace you'll reach Revise chapter 5 by Thu 27 Nov, 2 days late. 30 more min a day closes it."
  - "At this pace you'll be ready by Mon 24 Nov, 3 days early."
  - Nothing in the last 14 days: "No sessions on X in the last 14 days. 1 h 10 min a day gets you there by Sat 29 Nov."
  - Done: "X: all 20 h done."
  - Only goals with a date, hours and a date still to come get a pace.

### Round 4: onboarding
- New step **Your starting point** after the module steps (only if Study or Work was picked): "Honestly, how many hours do you study in a normal week right now?" (and work). Labelled: "An estimate is fine. Nobody else sees this."
- Then the projection on the same step, shown after Next: "**Estimate.** At about 5 h a week, that's about 260 h of study a year. Your target of 12 h a week adds about 360 h a year, the same as 9 full 40-hour weeks." Kind, no doom numbers.
- New last step **First focus session** (only with Study or Work): pick the module and 15 or 25 minutes, then Start. That finishes onboarding and opens the module's page with the timer running. "Skip for now" finishes without one. The Goals step's button becomes Next when this step follows.
- `starting_point` is saved from the estimate step, with today's date.

## Not changed
No paywall, no leaderboards, no shame nudges, no auto-ticking tasks. Existing settings and backups load as they are: every new field has a default, and nothing is removed from storage.

## Left to the builder
Markup, styles, the exact words not quoted above, and test layout.

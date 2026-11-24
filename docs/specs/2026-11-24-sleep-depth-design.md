# Sleep depth: debt, quality and rhythm — design

Date: 2026-11-24 · Mode: Product · Status: approved for planning (not built)

## Intent and the why

Compass's Sleep module measures only *quantity* today: hours against a target, and
bedtime on time. That leaves two questions a person asking "how is my sleep?" also
means unanswered: *am I building up a shortage*, and *is the sleep I get any good?*.

Rise answers the first with **sleep debt** and a **tonight plan**; Sleep Cycle answers
the second with a **morning rating** and **what moved it**. Both also surface **rhythm**
— how steady your sleep times are. Compass can compute all of these honestly from data
it already saves (bedtime, wake time, hours, the check-in tags, mood) plus one new
field, a 1–5 "how did you sleep?" rating. No sensors, no microphone, no model we'd be
making up.

This is the next feature round for the Sleep module. It is a design and plan only; no
code is written until the plan is approved and implemented separately.

## Goals

- Add a **sleep debt** readout (shortfall against the user's own target over 14
  completed nights) and fold a **tonight's bedtime** into the existing guidance line.
- Add a **morning quality** rating (1–5) and make it a first-class contributor, so the
  hero ring pills become Hours / Bedtime / Quality / Logging.
- Make the existing check-in tags pay off for sleep: **"what moves your sleep"**
  sentences on the Sleep page (caffeine late → shorter sleep, screens late → worse
  rating).
- Add **rhythm**: bedtime drift and weekend-vs-weekday drift (social jetlag), a
  caffeine cutoff, and a **Nights** chart that draws each night as a bed→wake band
  instead of only hour bars.

## Non-goals

- No smart alarm, sleep stages, snoring/sound recording, heart rate, or sleep-score
  number. All need a microphone or wearable Compass will never have.
- No energy schedule, "melatonin window", or circadian prediction. Those need a
  phone-use model; any time shown here would be invented.
- No invented "sleep need" from a model. The target the user set (or the schedule they
  gave) is the need.
- No medical advice. Debt is a shortfall against the user's *own target*, phrased as a
  running balance, never as a health judgement. The existing "general guidance, not
  medical advice" caveat stays.
- No change to Study, Work, Home or Insights layout. This round is the Sleep page and
  the shared pattern/brief plumbing it needs.

## Anti-goals

- The gauge hero stays the single verdict. Debt, quality and rhythm are quiet readouts,
  not competing judgements ("one judgement per screen").
- A gap is still never a zero: an unlogged night contributes nothing to debt, and an
  unrated morning contributes nothing to the quality average.
- Compass stays calm and sparse. This is one richer page, not five new charts.
- No new dependencies, no schema version bump, no CDN/fonts, dark only, 127.0.0.1 only.

## Constraints

- Plain Python (FastAPI) owns every rule; the web page is plain HTML/CSS/vanilla JS.
- Days are stored as a JSON object per date; adding a field needs no schema bump.
- The Sleep page already has: gauge hero, log form (bed/wake or hours), details block,
  chart (tabs "7 days / 12 weeks"), contributors (Hours, Bedtime, Logging).
- Patterns already exist (`insights.find_patterns`, 28-day window, 3 days each side,
  15% difference) but never treat sleep as an outcome.
- `insights.bedtime_guidance` already computes a "Tonight:" line and moves the bedtime
  earlier by 15-minute steps up to an hour when behind.
- PRODUCT.md currently says the module chart has exactly two tabs; a third tab is a
  deliberate deviation (flagged and approved here).

## Approaches considered

1. **One round, Sleep page only (chosen).** A single new day field, then computed
   readouts and one new chart tab. The debt and rhythm numbers are server-computed and
   purely presentational; the only new input is the quality rating. Keeps the gauge as
   the hero and adds depth where it belongs.
2. **Also thread every sleep signal through Insights and the daily brief.** More
   surface, but dilutes the Sleep page and risks the "five charts" feel. Rejected for
   this round except for the debt sentence in the brief (see below).
3. **Sensor-style tracking (alarm, stages, sound).** Rejected outright: impossible
   without hardware, and it would break the local, plain-stack promise.

## The design

### 1. New data: `sleep_quality`

- A new Day field `sleep_quality`: integer 1–5, or `None` (a gap) when unrated. Stored
  like `mood` (same validator shape), added to `normalize_day` in `server/app/models.py`.
  No schema bump. `merge_numbers` is untouched: quality is not a decimal log field.
- The rating is attached to the wake date, consistent with how bedtime/wake and hours
  are logged.
- Quality words (copy, my call): 1 Awful · 2 Poor · 3 Fine · 4 Good · 5 Great.

### 2. A — Sleep debt and tonight's plan

- **Debt** (`server/app`, new pure helper, e.g. in `sleep.py` or `insights.py`):
  over the last 14 *completed* nights (yesterday and the 13 before it), sum
  `max(0, target − hours)` for each logged night; unlogged nights are skipped, and the
  result floors at 0. Uniform weighting — no "last night counts 15%" claim we can't
  defend. Target is the sleep target (from the schedule or the explicit target, via the
  existing `target_for`). Rendered in details as:
  `Sleep debt: 4 h 20 min behind your target over the last two weeks.`
  With no debt: `Sleep debt: none — you've hit your target over the last two weeks.`
- **Tonight's plan** reuses `bedtime_guidance`: when debt is above a threshold
  (e.g. 30 minutes), append the debt framing to the existing "Tonight:" line —
  `Tonight: in bed by 22:15 to start clearing 4 h of debt.` When there is a schedule but
  no debt, the current line stays. When there is no schedule, guidance speaks in hours:
  `Tonight: aim for 8 h to start clearing 4 h of debt.`
- **Brief:** the daily brief gains one debt sentence when debt is high, in the existing
  brief voice (supportive/direct tone). Not a new section.

### 3. B — Quality and what moves it

- The Sleep log form gains a "How did you sleep?" row: five options, saved with the
  normal Save button, and valid on its own (rating without bed/wake). No autosave; the
  form is the single place the day's sleep is edited.
- **Quality contributor** in `module_contributors`: average of logged ratings over the
  7-day window, e.g. `3.4 of 5 on average`, mode `up`. Shown as the third ring pill and
  contributor row (order: Hours, Bedtime, Quality, Logging). Needs a glyph for the ring
  pill (proposal: a small sparkle/star, matching the 3px-stroke line-glyph style).
- **What moves your sleep:** extend the pattern engine so sleep can be the *outcome*.
  For each tag (and the existing "slept enough" group, where meaningful), compare
  tagged vs untagged days on `sleep_hours` and `sleep_quality` and `bedtime`, reusing
  the existing 3-days-each-side / 15% rules. Render two or three sentences at the foot
  of the Sleep page (main column, after contributors):
  `On days tagged Caffeine late you slept 6.2 h, against 7.4 h on other days.`
  `On days tagged Screens late your sleep averaged 3.1 of 5, against 4.0 on other days.`
  These stay on the Sleep page only for this round.

### 4. C — Rhythm and the Nights chart

- **Nights chart:** a third tab on the Sleep chart (tabs: 7 days / 12 weeks / Nights).
  Each logged night is a horizontal band from bedtime to wake time, wrapping past
  midnight, with the target bedtime/wake band overlaid, across the loaded weeks
  (12 weeks of data are already loaded for the page). Unlogged nights are a dim gap,
  never a zero-length bar. The tab follows the existing tab/tabpanel roles and arrow
  keys.
- **Rhythm stats** under the Nights chart (only when there is enough data — at least
  3 nights for drift; both a weekday and a weekend night for jetlag):
  `Bedtime moved 1 h 40 min this week.`
  `Weekends run 1 h 10 min later than weeknights.`
- **Caffeine cutoff** in the details block (general guidance, present when a schedule
  exists): `Last coffee by 14:30 to protect a 22:30 bedtime.` = bedtime − 8 h, capped so
  it never suggests later than 15:00. Phrased as guidance with the existing caveat.

### 5. What stays the same

- The gauge hero, the serif headline, the status line, and the "one judgement" rule.
- The 7-day and 12-week hour bars.
- The bedtime contributor, rest-day behaviour, and the brief's safety line under 5 h.
- Everything outside the Sleep page except: `module_contributors` (Quality row) and the
  brief (debt sentence), which are shared code the Sleep features touch.

## What's left to the builder

- Exact placement of the quality row inside the Sleep log form, and the ring-pill glyph.
- The precise wording of each new sentence, kept in the calm "instrument panel" voice.
- Where `sleep_debt` lives (`sleep.py` vs `insights.py`) and how the guidance and brief
  share it — the plan will pick one.
- How the Nights chart draws bands and the target overlay in SVG (the existing chart
  renderer is the model), and how it handles the 12-week vs phone width.
- The threshold for "debt is high enough to mention in the brief".
- Test lists: pure-function tests for debt, quality validation, rhythm stats and the new
  pattern outcomes; render tests for the Nights chart and the quality input.

## Recording (not part of this build)

After this round, the next step the user has asked for is **an AI API** (the AI
assistant already listed under "Later" in FEATURES.md). That will need to reconcile two
current promises — "makes no AI calls" and "talks only to 127.0.0.1" — and is its own
design later, not touched here.

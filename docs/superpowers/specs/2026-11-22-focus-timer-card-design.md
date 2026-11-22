# Focus timer card — design (2026-11-22)

## Intent

Make the Focus page's stopwatch and pomodoro feel like TickTick's Focus screen, with the motion
of the Pixlpin "Interactive Timer Widget — Expansion and Countdown" layered on top: a calm,
large digital readout in a circular ring, one obvious action, and a three-state card animation.
The current Focus timer reads like an instrument (LCD bezel, ghost digits, tick line); this
replaces that *on the Focus page only* with a single timer card. No Pixlpin asset is copied —
only its measured motion, palette and geometry are recreated in CSS/SVG.

## Reference: measured Pixlpin animation

The reference MP4 (1280x842, 30fps, 14.93s) was decoded frame by frame with PIL/OCR because no
vision model was available in the session. Measured sequence and values:

- **0–2.2s** collapsed charcoal pill: `Set timer` in white, 485x162, radius ~75.
- **2.2–2.5s** expands to 682x589, radius ~86; contents fade in after the size change.
- **2.5–5.5s** picker: ONE vertical wheel of minutes, row pitch ~74px, digits ~60–66px;
  selected row centred at y425, near-white `#FAFAFA`, neighbours fading symmetrically through
  an opacity gradient. `mins` in ~50px light grey sits on the selected row's baseline to its
  right. No hours/seconds columns, no header. Green Start pill 218x92, fill `#0B480F`, label
  `#34FD3D`.
- **5.6–6.0s** morph: panel widens and flattens to 759x347, radius ~76; wheel/Start cross-fade
  out, ring/digits/control pills cross-fade in. No number physically slides into the ring.
- **6–13.3s** countdown: digits `M:SS` in white, light weight (300–400), geometric sans, ~75px;
  progress stroke `#CF4436` on a `#333333` track, 13px wide, inset ~12px from the card edge,
  starting at 12 and draining counter-clockwise (~32px of gap per second on the 60s run).
  Pause/Resume pill `#2E1917` with `#F06F00` text; Cancel pill `#3A3A3A` with white text.
- **13.3–13.5s** reverses to the pill.

Canvas `#E5E5E5`, card `#272727`, flat with no gradients, blur or shadows. Compass keeps its
own page background and uses a circular SVG ring instead of the reference's rounded-rect edge
stroke — that is the one deliberate deviation, requested by the user.

## Goals

- One timer card on `#/focus`: task name, big plain digital time, thin progress ring, mode chips
  (Pomodoro / Stopwatch), duration chips + custom minutes, and one primary action.
- Running state keeps the same actions (Pause/Resume, Finish early or Stop and save, Reset,
  Skip break / End round), with task and area shown above the time.
- Keeps the Study/Work switch, WAI-ARIA Timer/Stopwatch tabs with arrow keys and the existing
  tab memory (`compass.tabs` keyed by `focus-<area>`; `compass.focus.tab` is the Today/Charts
  tab), and the away/save session flow. No new storage key.
- Reuses the shared timer state and rules in `web/js/timer.js`; nothing about sessions, totals,
  logs, charts, or the server payload changes.

## Non-goals

- No changes to the Study/Work module pages — they keep the LCD `renderFocusPanel` as is.
- No floating window, full-screen mode, or timer tiles bound to tasks (that was approach B).
- No schema, API, `timer.js`, or localStorage-key changes.
- No commits.

## Constraints

- Build in the `redesign-round-2` worktree; follow its CLAUDE.md (no commit/merge/reset/PR;
  clean up scratch; keep design specs).
- Tests: `.venv/bin/python -m pytest server/tests -q` and `node --test "web/tests/*.test.js"`
  must stay green; browser check at 360 and 1280 px with no console errors beyond the known
  favicon 404.

## Approaches considered

- **A — Timer card (chosen).** Replace the Focus page's start forms and running LCD with one
  card. Captures TickTick's defining feel without touching shared state or other pages.
- **B — Task-bound timer tiles.** Grid of tappable task tiles, each with its own mode. Closer to
  TickTick's behaviour but duplicates the task picker and is a much larger Focus-only change.
- **C — Visual restyle only.** Clean digits + ring, keep the instrument layout. Smallest diff,
  but still doesn't read like TickTick.

User picked A after seeing a sketch of the card.

## Decided how (builder's calls, recorded)

- Add `renderFocusCard(...)` in `web/js/render.js` and have `renderFocusPage` use it for the
  `#focus-page-timer` holder. Keep `renderFocusPanel` unchanged for the module pages and their
  tests. A thin shared helper may format the time and ring so both renderers use `timer.js` truth.
- Card states: idle (mode tabs, area switch, task, duration, Start), running (big time + ring,
  Pause/Resume and the existing controls), and away (Save/Discard). The mode tabs stay WAI-ARIA
  with arrow keys and `compass.focus.tab`; no new storage key.
- Styling: new `.focus-card` rules in `web/styles.css`, scoped so the module LCD is untouched.
  The card now has three rendered states that mirror the measured reference: a collapsed
  `Set timer` pill (`data-open="false"`), the expanded wheel picker (`data-open="true"`), and
  the running countdown (`data-state="running"`) with the circular ring. Clicking the pill or
  Escape toggles the picker; the ⋯ menu's Timer length opens it too. The running ring uses the
  existing `ringShare`, starts at 12 and drains counter-clockwise. Reduced-motion users get no
  card or picker animation.
- Page layout follows TickTick's Focus screen (captured at screenrove.com/ticktick/flows, screens
  42-44): a Pomo/Stopwatch segmented switch, a "Focus ›" link above a ~180px ring with the time
  inside and a pill Start button, and a right panel with four Overview tiles and the Focus Record.
  In Compass the right column holds the existing Overview tiles (Today's/Week's Pomo and Focus)
  and the session log; time-per-task stays below. The "Focus ›" label is a real `<label>` for the
  visible mode's task picker and follows live tab switches. TickTick's Focus Note is omitted:
  Compass has no note field and a dead input would be worse than none. No data or API changes.
- User refinement (2026-11-22): the minute input is the measured Pixlpin wheel — a single
  scrollable, snapping column of 1–180 minutes with the chosen value centred and neighbours
  faded by a CSS mask, plus a `mins` label on its baseline and a green Start capsule. The existing
  `input[name="focus-minutes"]` radios live inside it, and a compact "Exact minutes" field stays
  for direct entry and keeps the wheel in sync. The timer panel takes a true 50% of the desktop
  width with a 300px ring; "Full-screen timer" from the ⋯ menu grows it to 420px while keeping
  the stats rail. The page header carries TickTick's `+` and `⋯` tools; the ⋯ popover offers
  Focus statistics (Charts tab), Focus record (session log), Full-screen timer and Timer length
  (opens the pill and focuses the wheel). The popover does not hide the Overview tiles or Focus
  Record. Running controls use the reference's maroon/orange Pause and grey neutral pills; the
  LCD ghost is hidden on the Focus card only.
- Keep all current IDs and `data-focus` hooks (`focus-form`, `watch-form`, `focus-page-timer`)
  so `app.js` wiring and existing tests keep working; add tests for the card in
  `web/tests/focus.test.js`.

## Left to the builder

- Implement via a short plan, then verify both suites and the browser at both widths.

## Revised 2026-11-22: monochrome, TickTick layout

The user asked for the Focus page alone to be monochrome and laid out like their TickTick
screenshot (`taste-inbox/pixlpin-assets/interactive-timer-widget/videos/`), keeping the
circle rather than the reference's edge stroke. This replaces the colours, pill and layout
above; the wheel stays.

- Layout: TickTick's 60 / 40 split (`3fr 2fr` from 1100 px). The timer pane on the left has
  the title, Pomo / Stopwatch centred in the header row, + and ⋯ on the right; then Study /
  Work chips, "No task ›", the ring, Start. The rail on the right has Overview / Charts tabs:
  Overview holds the four tiles and the Focus record (a timeline per day with start and end
  times); Charts holds the 7-day and 12-week bars and time by task.
- Both panes are one screen tall, so the page never scrolls on a laptop. The ring sits in the
  exact middle of its pane and doesn't move when the rail switches tabs; a long record
  scrolls inside the rail. Below 1100 px everything stacks as before.
- Motion follows the reference video, all off under reduced motion: the wheel's rows blur,
  fade and shrink with their distance from the middle and scrolling picks the length live;
  the reading and the wheel swap with a blurred spring; Start, Pause / Resume, Stop and the
  Pomo / Stopwatch switch morph through View Transitions (time and buttons blur across,
  the ring holds still); digits roll as they change; the ring sweeps in on Start and drains
  smoothly; a paused time breathes.
- The task picker is a popover after the user's TickTick screenshot: "No task ›" opens a dark
  panel over the ring with Recent (that area's recent session tasks), Task (today's tasks
  and, for Study, its goals) and Habit tabs, a search box, a "No task" row and ring markers
  for each row. The choice sits in a hidden input with the old id. The exact length is a
  small popover too ("Type a time" under the wheel: the field and Set; Enter sets, never
  starts). Escape or a click outside closes either. Module pages keep their plain select.
- Searching for a task that isn't listed offers "Add “…”" (click or Enter): it is added to
  today's tasks and picked. With today's three tasks already set it is used for that
  session only, and a note in the popover says so.
- Popovers and the ⋯ menu are frosted glass like the app's panels and phone nav (translucent
  dark fill, 28px backdrop blur, a faint top edge); one popup is open at a time.
- Typing fields everywhere show focus by a lighter fill and the caret, without the white
  outline; buttons and other controls keep the outline.
- The ring is always shown. Idle it is a thin grey circle with the length ("25:00"); that
  reading is the button that swaps in the minute wheel. Running, a white arc drains from 12.
- White for the arc, Start and Pause; greys for the rest; a neutral page glow (#262626).
  The only colour is the modules' own (Study lilac `--focus-study`, Work sand `--focus-work`),
  used to tell sessions apart: the Focus record's dots and the charts' bars.
- The wheel has its own height and focus uses `preventScroll`, which fixes the page jumping
  about 13,800 px down when the picker opened.
- The duplicate "Focus" heading is gone: the view's h1 is visually hidden and the pane title
  is the visible one.

## Added 2026-11-22: what was worth taking from TickTick's Focus page

From TickTick's help pages (Start Focus, Maintain Focus, Timer, Focus Statistics), the user
asked for the parts worth having on a laptop:

- **Add and edit records.** "+" in the header and "+ Add" beside "Focus record" open one glass
  dialog: area, day it started, start, end, task. Each record row also has Edit (start, end,
  task; the day and area stay). Editing replaces TickTick's separate "Add Extra Time" and
  "Edit Focus Duration". End before start means it ran past midnight. New route:
  `PATCH /api/days/{date}/sessions/{id}`.
- **+ / − 5 min** beside the running time, shown when the ring is pointed at (always on
  touch). Never shorter than what has run; later sessions of the round keep the new length.
- **Stats** on their own page, `#/focus/stats` (the user found them too small in the rail;
  TickTick also keeps them on a separate Statistics page). Totals (last 7 days, this month,
  this year, longest streak, with the current streak allowed to end yesterday), Year (53
  weeks, Monday first, months on top, five shades; scrolls sideways on a phone and opens at
  the latest weeks), Focus timeline (14 days on 24-hour tracks with gridlines, module
  colours, split over midnight), Most focused time (minutes per hour over 12 weeks, peak
  named), the 7-day and 12-week bars, and time by task. The rail's Charts tab keeps only the
  bars and time by task, with a "See all stats" link; ⋯ > Focus statistics opens the page.
  `/api/focus` reads a year back and returns `year` and `hours`; the page has no new route.
- **Focus from a task:** each open task on Home has a Focus button that opens Focus with it
  picked (once; leaving the page clears it).

Left out for now: saved Timers (presets), white noise, the extra full-screen clock styles,
record filters, and everything TickTick marks mobile-only (strict mode, flip start, floating
window, screen always on, Live Activity) - those wait for the phone app.

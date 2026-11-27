Mode: Product · Lane: Fast. Compass is an app worked in daily (log, check the week, adjust a target), so motion stays calm. Round 1 was designed in Figma (2026-11-19); round 2 (2026-11-21) goes straight to code.

# Compass: product brief

## Who and what
- **Who:** one person on their own laptop (and sometimes phone), checking their week in a few minutes a day.
- **The job on a module page:** read how this week is going against the target, then log today. Editing the module's settings is occasional.
- **Feel:** a ship's instrument panel at night. Calm, precise, readable at a glance. Not a fitness app, not a SaaS dashboard.

## Redesign round 2 (2026-11-21): Opal iOS look
The user kept some of Binnacle and disliked the rest. Reference: the Opal iOS app from the Da-vinci library (`references/opal-ios/`), not the Opal website. Where this section and Binnacle below disagree, this section wins.
- **Kept:** dark only; each module's own page glow (now fading to true black by a third of the way down); the level colours and bands; the serif headline; the centred gauge hero; the side nav on laptops.
- **Accent:** no blue accent. The UI is white and grey: white solid pills for plain confirms, a white focus ring, the chosen tab a lighter grey pill. The one main action on a page (Save on the log) is an aurora pill washed in the module's own hue (`--hue`). Rose (`--rose`) only for leaving or deleting.
- **Surfaces:** true black base; panels are soft frosted glass (a 5% white tone, blur, a faint top edge, no border). Readouts (details, contributors) sit straight on the page (`.panel-quiet`). Sheets and dialogs are stronger glass over a blurred page.
- **Density:** 15 px body, smaller hero and headings, 12 px gaps.
- **Charts:** one chart per module page with tabs "7 days / 12 weeks" (roles tab/tabpanel, arrow keys), bars in the module's hue.
- **Module layout:** from 1100 px, a side column (log, then details; sticky) and a main column (chart, then contributors) at 5 : 7. Below that, one column in the same order.
- **Contributors:** verdict rows: name and level word on one line, a five-segment bar in the level colour, the line of text under it.
- **Hero (after the Sleep review, 2026-11-21):** the gauge arc is drawn in the module's own hue (dim at the start, light at the reading) over a visible dim track; the level colour stays only on the level badge and words. Under the serif headline there is one line (level badge and trend), then one ring pill per contributor (its capsule outline lit to the score). The other facts moved: the guidance ("Tonight: ...") and rest days into the details block, the 14-day baseline into the chart panel. The serif is kept as is.
- **Study and Work:** the focus timer is the page's main action (aurora Start); the log's Save is a white pill. On wide screens their details sit under the contributors so the columns end together; below 1100 px the order is still timer, log, details, chart, contributors.
- **Focus timer:** an LCD readout in a dark bezel set in DSEG7 Classic (unlit "8"s behind the lit digits) with a timeline under it; while running, a glow in the module's hue breathes by opacity only, and is still under reduced motion.
- **Timer and Stopwatch (2026-11-22):** the focus timer has two tabs, as in TickTick. Timer: presets 15 / 25 / 50 plus your own length (1 to 180 min), counted down in rounds of 4 with breaks. Stopwatch: counts up until Stop, which saves the whole minutes; it stops and saves by itself at 3 h (the server's session limit). Like the timer, it never counts time Compass couldn't watch: after a gap of over 3 minutes (laptop asleep, tab closed) it stops and asks "Save it?" with only the minutes up to its last tick (2026-11-22). Both save sessions the same way. Each page remembers its tab.
- **Focus page is monochrome (2026-11-22):** laid out like TickTick's Focus screen (timer pane left, totals and Focus record rail right; the charts live on Focus stats, which shares the same look), white arc, white Start, grey everything else and a neutral glow; the only colour is the modules' own (Study lilac, Work sand) on the Focus record's dots and the charts' bars. Every other page keeps its colours. Spec: `docs/specs/2026-11-22-focus-timer-card-design.md`.
- **Ring pills (2026-11-22):** a small line glyph each (moon or hourglass for Hours, clock for Bedtime, check for Logging), 3 px strokes on a brighter track, and a thin bracket from the status line down to the pills.
- **One judgement per screen (2026-11-22):** no trend chip when there is no trend; the chart's 14-day line keeps its numbers but drops its verdict. Bedtime has its own words: On time / Ok / Late.
- **Pay attention is coral (2026-11-22):** `--level-attention` is #f9607f, like Opal's warning coral; Optimal blue, Good teal and Fair sand are unchanged.
- **Insights is gold (2026-11-22):** glow #38331a, hue #d4b648, a muted gold so it no longer looks like Sleep's green. It stays apart from Work's copper (#4a3526 / #d6b08c) and from Fair sand (#e8c98a). Grey text on the glow is 5.18:1; a bar at 68% on glass is 5.0:1.
- **Every page uses the module-page space (2026-11-22):** all pages but onboarding are 1120 px wide. Home and Insights keep the gauge hero on top, then a side column (5fr) and a main column (7fr) from 1100 px, the shorter column's last panel stretching so both end together (`.page-layout`). Home: brief, focus, capture | check-in, goals, habits; phones read brief, check-in, focus, goals, capture, habits (`data-order`). Insights: this week, patterns | streaks (two to a row), Focus Report. Settings is three columns (modules and tone | goals | habits and data) and fits one 1440x900 screen.
- **Headings (2026-11-22):** panel titles stay as they are; bare sections (Your schedule, Contributors, Your goals) get a small uppercase muted eyebrow.
- **Times are 24-hour everywhere (2026-11-22):** time boxes are text boxes in HH:MM ("2300" tidies to "23:00"), never AM/PM.
- **Empty days in charts:** a muted en dash over a dim empty column, never a bar at 0.
- **Time boxes:** not prefilled with the schedule (a Save would log planned times as real ones); the empty "--:--" is dimmed and the clock button is quiet.
- **Not taken from Opal:** the gem or any mascot, the plinth, hold-to-commit games, onboarding typing, aurora on every button, Opal's name, copy or screens.

## Design direction (chosen 2026-11-19: "Binnacle")
- **The gauge stays where it is (fixed by the user, 2026-11-19):** the hero (half-circle gauge, the number inside it, the serif headline, then the status line) stays centred at the top of every page, above everything else, on laptops and phones. Never move it into a column.
- **Layout:** below the hero, on wide screens (1180 px and up), module pages (Sleep, Study, Work) and Insights split into a rail on the left (340 px, sticky) and an area that fills the rest of the width.
  - Module pages: the rail holds the log form, then the module details with Edit. The chart area holds the last 7 days, the last 12 weeks, then the contributors as columns.
  - Insights: the rail holds the one thing to change, then this week's modules and extras. The wide area holds Patterns and Streaks side by side.
  - From 600 to 1179 px: one column in the same order, both charts shown.
  - Below 600 px: one column (hero, log, details, charts, contributors), with the two charts as tabs (7 days, 12 weeks) and the fixed bottom nav.
- **Signature:** the gauge's arc gets compass-bezel ticks and a lubber mark at the reading (same half-circle, same place); the target is one labelled "course line" that runs through every chart.
- **Two surface tiers:** things you type into sit on raised panels; readouts (charts, contributors, details) sit on the page, separated by hairline rules and space.
- **Type:** the existing serif for page titles and dial headlines, system UI for everything else, tabular numbers on every value.
- **Colour:** the existing dark tokens, one accent (binnacle blue), level colours only for status.
- **Page glow (fixed, 2026-11-19):** every page keeps its soft radial glow at the top, each in its own colour: Home #2b3c4f, Sleep #1f4038, Study #3a2c4f, Work #4a3526, Insights #24403f, Settings #2c3035. Never drop it or flatten it to one colour.
- **Components (2026-11-19):** built on shadcn/ui's anatomy and states (Button, Input, Label, Card, Tabs, Separator, Progress, Badge, Tooltip, Chart), restyled to Compass's tokens and glow so stock shadcn isn't recognisable. The code stays plain HTML, CSS and vanilla JS: no React, no Tailwind, no build step, no CDN.
- **Reference (from the Da-vinci library, 2026-11-19):** the Oura app. Taken: the glow per page, the open arc gauge with one big light number, level words in their level colour, layering by tone with no borders, the serif only for editorial headlines. Not taken: Oura's score bands (Compass keeps 100 Optimal, 85 to 99 Good, 70 to 84 Fair, below 70 Pay attention), its icons, photos, copy, tracked-capital labels, or its phone layout on laptops. Oura's images are private references and never go into Compass.
- **Scope:** Sleep, Study, Work and Insights get the new layout. Home and Settings keep their layout and pick up the restyled shared parts.
- **Room for later:** the rail leaves a slot under the log for the v2 focus timer on Study and Work.

## Edge states (designed in Figma, States section)
- **First use (no data yet):** the gauge shows its bezel with "-" and "No bearings yet"; every day is a gap; each chart says "Your first entry shows here."; contributors read "Not logged yet". A gap is never drawn as 0.
- **Loading:** a skeleton in the real layout's shapes, shown only after 200 ms, with aria-busy on the region and no shimmer under reduced motion.
- **Load error:** "Sleep didn't load" in the hero's place, one plain sentence, and a Try again button that takes focus. No banner.
- **Log form:** default, saving (button keeps its width, blocks a second submit), saved (time stamp in the card header), field error under its own field.
- **Edit open:** the edit form replaces the details in the rail; the chart area stays; Cancel or Esc returns focus to Edit.
- **Bar hover and focus:** tooltip above the bar, a focus ring on keyboard focus, the same words in visually hidden text.
- **Long content:** text wraps and is never cut off; a number and its unit never split.

## Material
All content is real app data from the API. Nothing is invented; a gap reads "not logged", never 0.

## Constraints
- Home Wi-Fi access (2026-11-25): the user will use Compass on their phone too. `start.py --lan` listens on the home network behind a passcode (`server/app/lan.py`); the laptop needs none. Without `--lan`, 127.0.0.1 only. Sleep stamps ("Going to bed" / "I'm up", 2026-11-27) sit on the Sleep page's log card: a tap saves the time on the day you wake up (a bedtime from noon on goes on tomorrow), and the tapped button turns into Undo (after "I'm up" the two merge into one wide Undo); Undo needs a second tap within 3 s ("Tap again to undo") and takes the taps back one step at a time. Each swap slides the old label up and the new one in; the merge folds the first column away. Next: the morning card with usual-time chips.
- 127.0.0.1 only: no CDN, web fonts or icon fonts. One exception (2026-11-22): the timer's seven-segment face, DSEG7 Classic Bold, is a local file in `web/fonts/` (SIL Open Font License, `web/fonts/DSEG-LICENSE.txt`), used for the timer only.
- Plain HTML, CSS and vanilla JS in one `index.html`; the Python server owns every rule.
- Dark theme only, contrast 4.5:1 or more, every input labelled, keyboard-only works.

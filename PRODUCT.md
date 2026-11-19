Mode: Product · Lane: Figma. Compass is an app worked in daily (log, check the week, adjust a target), so motion stays calm. The user asked for the design to be made in Figma first (2026-11-19).

# Compass: product brief

## Who and what
- **Who:** one person on their own laptop (and sometimes phone), checking their week in a few minutes a day.
- **The job on a module page:** read how this week is going against the target, then log today. Editing the module's settings is occasional.
- **Feel:** a ship's instrument panel at night. Calm, precise, readable at a glance. Not a fitness app, not a SaaS dashboard.

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
- 127.0.0.1 only: no CDN, web fonts or icon fonts.
- Plain HTML, CSS and vanilla JS in one `index.html`; the Python server owns every rule.
- Dark theme only, contrast 4.5:1 or more, every input labelled, keyboard-only works.

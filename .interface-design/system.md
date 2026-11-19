# Compass design system: Binnacle

The source of truth is the Figma file **Compass**, page "Binnacle · Modules & Insights":
https://www.figma.com/design/jX1GJQFOQgpkVNBNk7i93m/Compass?node-id=15-553

Read `PRODUCT.md` first for the direction and the rules fixed by the user. This file is what to build.

## Ground rules for the build
- Plain HTML, CSS and vanilla JS in the existing files (`web/index.html`, `web/styles.css`, `web/js/*.js`). No React, Tailwind, build step, CDN, web fonts or icon fonts.
- The Python server owns every rule. The page only draws what the API sends. No server or API changes are needed.
- Tokens below match the Figma variables 1:1. No hard-coded colours, radii or spacing in component rules.
- Dark theme only. Every value uses `font-variant-numeric: tabular-nums`.
- `web/tests/render.test.js` must keep passing. It checks `<span class="hero-number">6.8</span>`, seven `class="week-bar"`, twelve `class="week-bar history-bar"`, the ids `module-edit`, `module-edit-form`, `module-edit-error`, `module-edit-cancel`, `module-study` and `mod-study-name-0`, the text "1 rest day<", and no `hero-note` without guidance. Keep those class names and ids; add classes beside them rather than renaming.

## Tokens (Figma variable → CSS custom property)

Collection **Binnacle** (one mode, Dark). Existing properties keep their names; the ones marked new are added to `:root` in `styles.css`.

| Figma variable | CSS | Value | Role |
|---|---|---|---|
| color/bg | `--bg` | #101214 | Page |
| color/surface | `--surface` | #1b1e21 | Raised panel (log card, edit form) |
| color/surface-2 | `--surface-2` | #272b2f | Control hover, current nav item |
| color/inset (new) | `--inset` | #0d0f11 | Input well |
| color/text | `--text` | #f4f2ee | Text |
| color/text-muted | `--text-muted` | #a3a8ad | Secondary text |
| color/accent-text | `--accent-text` | #0c1a26 | Text on accent |
| color/border | `--border` | #2a2e33 | Control edge (inputs, outline button) |
| color/rule (new) | `--rule` | rgb(255 255 255 / 7%) | Hairline between readouts |
| color/rule-strong (new) | `--rule-strong` | rgb(255 255 255 / 12%) | Strong hairline, gap mark |
| color/track (new) | `--track` | rgb(255 255 255 / 14%) | Gauge track, meter track |
| color/accent | `--accent` | #8fc4ee | Primary button, today's bar, course label, current tab |
| color/accent-soft | `--accent-soft` | #1b2a38 | Selected day toggle |
| color/focus | `--focus` | #8fc4ee | Focus ring |
| color/good, good-soft | `--good`, `--good-soft` | #74d095, #17301f | On track |
| color/warn, warn-soft | `--warn`, `--warn-soft` | #f2a65e, #3a2615 | Behind |
| color/danger, danger-soft | `--danger`, `--danger-soft` | #f08a8a, #3a1b1c | Errors |
| level/optimal | `--level-optimal` | #8fc4ee | Level word, gauge arc, meter |
| level/good | `--level-good` | #9fd8c2 | 〃 |
| level/fair | `--level-fair` | #e8c98a | 〃 |
| level/attention | `--level-attention` | #f2a65e | 〃 |
| radius/control | `--radius-small` | 10px | Inputs, tabs list, tooltip |
| radius/panel | `--radius` | 16px | Cards |
| radius/bar (new) | `--radius-bar` | 6px | Top corners of chart bars (bottom 2px) |
| radius/pill (new) | `--radius-pill` | 999px | Buttons, badges, nav items, day toggles |
| layout/rail (new) | `--rail` | 340px | Rail width |
| layout/nav (new) | `--nav-width` | 200px | Side nav width |

Collection **Page**, variable `page/glow` → `--glow`, one mode per page. Keep the existing `body[data-page]` overrides exactly: Home #2b3c4f, Sleep #1f4038, Study #3a2c4f, Work #4a3526, Insights #24403f, Settings #2c3035. Keep the radial glow on `.shell-main`.

Collection **Space** → `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24, `--space-8` 32, `--space-12` 48, `--space-16` 64 (new; `--gap` stays 16). The Space collection's `radius/sm|md|lg|full` belong to an older direction: don't use them.

Contrast (checked in Figma, 03 · Color): every text pair passes AA; the lowest is danger on danger-soft at 6.4:1. Muted text on the brightest point of a glow is 4.7:1 at worst (Home, Sleep, Insights).

## Type
Code keeps the system stacks. Figma uses Gelasio for the serif and Noto Sans for system-ui.

| Style | Font | Size / line | Weight | Used for |
|---|---|---|---|---|
| Page title | serif | 36 / 42, -0.02em | 400 | h1 |
| Dial number | sans | 64 / 68 | 300 | `.hero-number` (4rem, as now) |
| Dial headline | serif | 28 / 34 | 400 | `.hero-headline`, load error title |
| Lead | serif | 20 / 28 | 400 | Insights' one thing to change |
| Section | sans | 16 / 24 | 600 | h2 in panels |
| Body | sans | 16 / 24 | 400 | Text |
| Body strong | sans | 16 / 24 | 500 | Module links in Insights |
| Meta | sans | 14 / 20 | 400 | Hero meta, hints, tooltips |
| Label | sans | 14 / 20 | 600 | Field labels, course value |
| Caption | sans | 13 / 18 | 400 | Kicker, bar values and days, course unit |
| Button | sans | 15 / 20 | 600 | Buttons |

Sentence case everywhere in the app. Remove the uppercase from `.hero-kicker` and `.nav-label`.

## Layout
Screens: Sleep 1440 `20:587`, Study 1440 `20:792`, Work 1440 `20:984`, Insights 1440 `24:1304`; Sleep 390 `24:843`, Study 390 `24:1005`, Work 390 `24:1154`, Insights 390 `24:1473`.

- `main` max-width goes from 760 to 1240 (the area beside the 200 px nav). Padding 28 top, 32 sides, 48 bottom. Keep `.site-header-inner` in step.
- **The hero does not move.** It stays first in `#module-body` / `#insights-body`, centred, gauge then kicker then number then headline then meta then note, exactly the current DOM order.
- Below the hero, wrap the rest in a new `.binnacle` grid:
  - ≥ 1180px: `grid-template-columns: var(--rail) 1fr; gap: var(--space-12)`. `.binnacle-rail` is `position: sticky; top: var(--space-6)`. `.binnacle-main` holds the charts.
  - 600–1179px: one column, same order, both charts visible, contributors 3 across.
  - < 600px: one column (log, details, charts, contributors). The two chart sections become Tabs ("7 days" | "12 weeks"); contributors stack. The existing fixed bottom nav (< 800px) stays.
- `.module-grid` is no longer a flex column of identical panels.
- Module pages: rail = `.module-log` then a Separator then `.module-details`. Main = `.module-days`, Separator, `.module-history`, Separator, `.module-contributors` (as columns).
- Insights: rail = `.review-change` (moved to the top, set in Lead) then This week (`.review-list`, extras). Main = Patterns (3fr) and Streaks (2fr) side by side; stacked below 1180px.
- Readouts (charts, contributors, details, patterns, streaks) drop `.panel` chrome: no background, no border, no radius. They sit on the page, separated by Separators and space. Only `.module-log` and the edit form are raised (`--surface`, `--radius`, no border, no shadow).

## Components (Figma 06 · Components, built on shadcn/ui anatomy)

| Component (Figma id) | States | Replaces or changes in code |
|---|---|---|
| Dial `17:702` | Level = Optimal, Good, Fair, Pay attention, No data | `gauge()` and `.hero`, `.gauge*`. Same 200×112 half-circle, same place and width `min(300px, 82%)`. Add 21 bezel ticks outside the arc (every 5 points; every 25th longer) and a lubber mark at the reading (a short radial line in the level colour). Arc fill in the level colour; track `--track`. The kicker stays inside the arc above the number. No data: track and ticks only, number "-". |
| Badge / Status `16:676` | On track, Behind, No data | `.status` in `.hero-meta`. Pill, level dot plus word, `--good-soft`/`--warn-soft`/`--surface-2` fill with `--good`/`--warn`/`--text-muted` text. |
| Button `16:617` | Variant Default, Outline, Ghost × Default, Hover, Pressed, Focus, Disabled, Busy | `.btn`, `.btn-primary`, `.btn-ghost`. Pill, min-height 40, padding 8×18, Button type style. Pressed: scale 0.97, 120 ms. Busy: spinner plus "Saving", keeps width, `aria-disabled`, blocks a second submit. Focus: 2px `--focus` ring, 2px offset. "Edit sleep" etc. becomes Ghost. Default button style for `#module-edit` changes to Ghost. |
| Input + Label `16:665` | Kind Hours, Time × Default, Focus, Error, Disabled | `.field`, `.input-unit`, `logNumber()`, `logTime()`. Input sits in an `--inset` well with a 1px `--border`, `--radius-small`; focus = `--focus` border plus ring; error = `--danger` border and a message under the field in `--danger` (Meta). |
| Card / Log `19:622` | Kind Schedule, Hours × Default, Saved | `.module-log`. Raised panel, padding 24, no border. Title row with `.save-status` on the right ("Saved 07:12"). Sum line ("= 8.2 h a night") bottom left, Save bottom right. |
| Card `22:896` | – | The edit form shell (`#module-edit-form` inside `.module-details`): header, content, footer with Save and Cancel. |
| Separator `22:841` | Horizontal, Vertical | New `.separator` (1px `--rule`), replaces per-panel borders. |
| Progress `22:851` | Tone = Optimal, Good, Fair, Pay attention | `.meter`, `.meter-fill` and the Insights module rows. 4px track `--track`, indicator in the level colour, width from `--value`. |
| Contributor row `17:738` | Level = Optimal … No data | `contributorList()`, `.contributor*`. Label left, level word right in its colour, Progress, then the text in Meta. |
| Tabs / Trigger `22:871`, Tabs / List `22:876` | Active, Inactive, Hover, Focus | New, phones only: a `role="tablist"` with two `role="tab"` buttons above the charts; arrow keys move between them; the panels keep their ids. Laptops show both charts and hide the tablist. |
| Tooltip `22:882` | – | New on chart bars: day and value above the bar on hover and keyboard focus (opacity 120 ms). The `.visually-hidden` text in each bar stays. Bars get `tabindex="0"`. |
| Nav link `17:756` | Default, Hover, Current, Focus | `.nav-link`, `.nav-label`. Pill highlight `--surface-2` for the current page, sentence-case "Modules". |
| Icons `16:557` to `16:576` | – | The existing `ICONS` in render.js, unchanged. |

### Charts (`barChart()`, `.week-bars`, `.week-bar*`)
- Past bars: `--accent` at 50% opacity. Today (or the current week): full `--accent`, its day label in Label weight and `--text`.
- Bar corners `--radius-bar` top, 2px bottom. Value above each bar in Caption, `--text-muted`.
- **Course line (the signature):** replace the dashed line drawn on every bar track (`::after` per item) with one dashed line across the whole chart at `--target`, 1px `--text-muted` at 70%, plus a label in a 64px right gutter: the value in Label ("8 h") and the unit in Caption ("a night", "a day", "a week"). The target value comes from the API (`daily_target`, `weekly_target`).
- Gaps (`data-gap`): a 12×2 `--rule-strong` mark on the baseline and "-" above it. Never a zero bar.
- 7 days: plot 168px high on wide screens, 140 on phones. 12 weeks: plot 110.

## Edge states (Figma States section)
First use `31:1182`, loading `31:1437`, load error `31:1614`, log card states `32:1345`, bar tooltip `32:1453`, Work edit open `32:1487`, long content `32:1551`.

- First use: Dial No data with "-", headline from the API, Badge No data; each chart shows gaps and "Your first entry shows here." centred in the plot; contributors Level No data with the API's text.
- Loading: a `.loading` skeleton in the real shapes (gauge track, headline and meta bars, log card block, bar blocks), shown only after 200 ms, `aria-busy="true"` on `#module-body`; shimmer 1.4s on `--surface` → `--surface-2`, off under reduced motion.
- Load error: in place of the hero, "<Module> didn't load" (Dial headline), one sentence in Meta, an Outline "Try again" button that takes focus. No banner.
- Field errors under their own field. `.form-error` loses its 4px left border: plain `--danger` text.
- Edit open: the Card replaces the details in the rail; the chart area doesn't move. Focus goes to the first field; Cancel or Esc restores the details and returns focus to Edit.
- Long text wraps, never ellipsis; use a non-breaking space between a number and its unit.

## Motion
Nothing animates on load; the gauge does not sweep. Button press 0.97 / 120 ms ease-out. Save status fade 160 ms. Tooltip fade 120 ms. Skeleton after 200 ms. Tab switch is instant. Under `prefers-reduced-motion: reduce`, no scale, no shimmer, fades at 0 ms.

## Build order
1. Tokens in `:root` (table above). Run the tests.
2. Layout: `main` width, the `.binnacle` grid and rail in `renderModulePage()` and `renderInsights()`, with the hero left first and unchanged in order. Remove `.panel` chrome from readouts.
3. Hero: bezel ticks and lubber mark in `gauge()`, sentence-case kicker, Badge for `.status`.
4. Log card, Input, Button (states, Busy, Saved stamp).
5. Charts: course line and gutter label, bar styles, gaps, tooltip and focusable bars.
6. Contributors as Progress rows in columns; Separator.
7. Insights rail and Patterns / Streaks columns.
8. Phones: Tabs for the two charts, stacking order.
9. Edge states: first use, skeleton, load error, edit form in the Card, field errors.
10. Nav: sentence-case group label, pill current item. Home and Settings pick up the shared parts only.
11. Check at 390 and 1440 against the Figma screens and States, run `node --test "web/tests/*.test.js"` and pytest.

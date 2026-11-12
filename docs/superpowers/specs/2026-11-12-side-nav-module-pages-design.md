# Compass: side nav and module pages (design)

## Context
Compass is one long Home page plus Settings, reached by two buttons in the top bar. Sleep, Study and Work each got their own onboarding page (2026-10-29, 2026-11-04, 2026-11-09), but after onboarding a module is only a card on Home and a section in Settings.

The Study design (2026-11-03) already said what comes next: "Each module will get its own page, with a side nav to reach it." This is that round.

You asked for a side nav that goes to the modules. You weren't sure what a module page should show and asked for a recommendation; you then said to do all five parts of it. You looked at a mockup of the nav and the Sleep page, said it looks good, and picked the bottom bar for phones.

**Who writes what:** Claude writes all of it, JS included, then explains the code thoroughly enough that you could rebuild it from scratch (the same rule as the Sleep, Study and Work rounds).

## Goals
- A **nav** that is always on screen after onboarding: Home, the modules that are switched on, Settings.
- **One page per module** (Sleep, Study, Work) showing: this week, the last 7 days day by day, the module's own details, a log form for today, and an Edit button for its settings.
- **Settings loses the Sleep, Study and Work sections.** Each module is edited on its own page.
- Reload stays on the page you were on, and the browser's Back button works.

## Non-goals (this round)
- Trimming Home. The Study design said Home would later show "only the important things from each module". Home stays exactly as it is this round. *(my call, said in chat)*
- New rules or numbers. Every value on a module page already exists in Compass.
- Charts or graphs. The last 7 days is a plain list.
- Pages for Habits, Goals, focus tasks or notes.
- Looking further back than 7 days.
- A light theme, icons in the nav, a collapsible nav.
- Changing onboarding.

## Anti-goals (it fails even if it works, if...)
- A setting can no longer be changed anywhere. Everything the three Settings sections could do must be doable on the module pages.
- The nav shows a module that is switched off, or a page for one can be reached.
- The page computes a status, target, countdown or tip itself. Python writes them; the page shows them.
- A gap shows as 0. A day with nothing logged reads "not logged".
- The phone layout scrolls sideways at 360 px, or the bottom bar covers the last thing on a page.
- Data leaves the laptop. Compass stays 127.0.0.1-only, with no icon fonts or CDN.

## Constraints
- The architecture doesn't change: the Python server owns every rule, and the page only draws what the API returns. Rules are written test-first.
- Still one `index.html`, plain HTML/CSS/vanilla JS, existing tokens and classes, dark theme only, contrast of 4.5:1 or more.
- Every input has a label. Nav and pages work with the keyboard only.
- No git. You review and commit.

## The nav
**Items, in order:** Home · Sleep · Study · Work · Settings. A module appears only while it is in `settings.modules`. *(agreed)*

- **Laptop (800 px and wider):** a column on the left, as in the mockup. "Compass" with its mark at the top, then Home, a small "Modules" label, the module links, and Settings at the bottom of the column. It stays put while the page scrolls. *(agreed from the mockup; the 800 px switch point is my call)*
- **Phone (under 800 px):** a bar fixed to the bottom of the screen with the same links as text, no icons. The "Modules" label is not shown. The page gets enough bottom padding that the bar never covers content. A slim top bar keeps "Compass" and the date. *(bottom bar agreed; the rest is my call)*
- **Today's top-bar Home and Settings buttons go away.** On a laptop the top bar goes too: the brand moves into the nav, and the date sits at the top of the main column, above every page. *(my call)*
- **Hidden during onboarding** and while loading. It appears when onboarding finishes. *(my call)*
- The links are real `<a href="#/sleep">` links inside `<nav aria-label="Main">`. The link for the page showing has `aria-current="page"` and the highlighted look from the mockup.
- Saving modules in Settings redraws the nav straight away.

## Pages and addresses
Each page has an address after the `#`, so it is still one HTML file and the server needs no new routes. *(my call)*

| Address | Page |
|---|---|
| `#/` or nothing | Home |
| `#/sleep`, `#/study`, `#/work` | that module's page |
| `#/settings` | Settings |

- Clicking a nav link changes the address; the page listens for the change (`hashchange`) and shows the matching view. Reload and the Back and Forward buttons therefore work.
- An unknown address, or a module that is switched off, goes to Home (and the address is set to `#/`).
- During onboarding the address is ignored. When onboarding finishes the address is set to `#/`.
- After Delete everything, onboarding shows and the nav hides.
- When a page shows, focus moves to its `<h1>`, the way onboarding moves focus to each step heading.
- Each page loads fresh data when it shows, as Home does today. The midnight check reloads whichever page is showing.
- **On Home, each area card's title becomes a link to its module page.** *(my call)*

## The module page
One view, `#module-view`, redrawn for whichever module is showing. All three modules use the same layout: *(layout agreed from the mockup)*

```
 Sleep                                   <h1>, gets focus
 +-----------------------------------------------------+
 | This week                                           |
 | 6.8 h   [Behind]                                    |
 | average a night · Target 7.5 h                      |
 +-----------------------------------------------------+
 +---------------------------+ +-----------------------+
 | Last 7 days               | | Log last night        |
 | Fri 6        7.5 h        | | In bed [  ] Up [  ]   |
 | Sat 7        8 h          | | [Save]  = 7.5 h       |
 | Sun 8        not logged   | +-----------------------+
 | ...                       | +-----------------------+
 | Today        not logged   | | Your schedule         |
 +---------------------------+ | In bed 22:30 · Up 06:00|
                               | In bed after 22:30 ...|
                               | [Edit sleep]          |
                               +-----------------------+
```
On a phone the panels stack in one column: This week, Log, Last 7 days, details.

**1. This week.** The same numbers as the module's card on Home: value, status in words, target or limit, and for Sleep "average a night", for Study and Work "this week". With nothing logged: "No data" and the target.

**2. Last 7 days.** Seven rows, oldest first, today last and labelled "Today". Each row: the day ("Fri 6") and the value with its unit, or "not logged". Sleep rows show hours only, also for schedule users (the server already works the hours out from the times). A real 0 shows as "0 h". It is a table with a visually hidden caption and column headings, so a screen reader reads it sensibly. *(my call)*

**3. Log today.** The panel is headed "Log last night" for Sleep and "Log today" for Study and Work. Only this module's fields, the same controls and limits as the Home log form:
- Sleep with a schedule: In bed and Up times with the "= 7.5 h a night" line. Sleep with a goal: hours.
- Study: hours. Work: hours, labelled "Job search" for a job hunter, otherwise "Paid work".
- Save changes only this module's fields on today's entry and leaves everything else on the day alone. Blank is saved as a gap. The Sleep rule from the Home form still applies (with a schedule, times are sent and hours cleared; with a goal, the other way round).
- After saving, the whole page redraws from the server, so This week and Last 7 days update, and a "Saved 14:05" status shows.

**4. The module's details.** A short heading and lines of text that Python writes:

| Module | Heading | Lines |
|---|---|---|
| Sleep, schedule | Your schedule | "In bed 22:30 · Up 06:00", then the brief's bedtime line ("In bed after 22:30 on 3 of 6 nights.") when there are 4 or more logged bedtimes |
| Sleep, goal | Your goal | "7.5 h a night" |
| Study | Your goals | one line per study goal, in saved order: the name, then the same countdown words the card uses ("Exam · in 12 days", "Essay · date passed", just "Thesis" for no date). With no goals: "No study goals yet." |
| Work | Your work | the role; "Goal: ..."; the hours ("Mon to Fri, 09:00 to 17:00 · 40 h a week", or "Hours vary · 25 h a week"); then "This week's tip: " and the Work tip. Lines with nothing saved are left out. With an empty profile only the tip line shows. |

*(the exact wording of these lines is my call; you may want to rewrite it)*

**5. Edit.** A button under the details: "Edit sleep", "Edit study", "Edit work". *(my call on how it opens)*
- Clicking it replaces the details panel with the module's form, in place: the same controls, checks and messages Settings has today:
  - Sleep: a goal in hours or a schedule. "Let's work it out" stays onboarding-only, as it is in Settings today.
  - Study: the goal rows with Add and Remove, and hours a week.
  - Work: all six questions on one form.
- **Save** checks, saves with one `PUT /api/settings`, closes the form and redraws the page. **Cancel** closes the form and changes nothing. Focus goes to the form's first control when it opens and back to the Edit button when it closes.
- Errors show under the form, as they do in Settings.
- Only one thing redraws the page: a save. Saving the log while the Edit form is open closes the form without saving it. *(my call: simplest rule)*

## Settings afterwards
- Keeps: Modules, Habits, Goals, Your data.
- Removed: the Targets panel (it only held Sleep's controls), the Study panel and the Work panel, with their handlers.
- `renderTargetRows` and its tests are removed, since nothing lists target rows any more. *(my call: no dead code; it was "kept for future areas" last round)*
- Turning a module on in Settings adds it to the nav; its page works straight away with defaults, and the person fills it in with Edit.
- A hint under Modules: "Each module has its own page in the menu, where you can change its goal." *(my call)*

## Data and API
No change to what is saved. No new endpoint.

`GET /api/dashboard` grows, so a module page is one request and Home keeps working: *(my call)*
- Top level: `dates`, the 7 date keys of the window, oldest first. Each area's existing `series` lines up with it.
- Each area entry gets `details: {"title": str, "lines": [str]}`, written by a new `server/app/pages.py` (one function per module, using `bedtime_line`, `when_text`, `week_hours` and `work_tip`, which already exist).
- Day labels ("Fri 6", "Today") are made in the page from `dates`, since they are formatting, not a rule; the page already formats today's date this way.

## Files expected to change
- `server/app/pages.py` (new): the details title and lines for Sleep, Study and Work.
- `server/app/dashboard.py`: `dates` and each area's `details`.
- Tests: `server/tests/test_pages.py` (new), test_dashboard / test_api for the new fields.
- `web/index.html`: the nav, `#module-view`, the date line; the top-bar buttons and the three Settings panels removed.
- `web/styles.css`: the two-column shell, the side nav, the bottom bar, the module page panels and the 7-day table.
- `web/js/render.js`: `renderNav`, `renderModulePage` (and small helpers for the week panel, the day rows, the log fields, the details and the edit form, reusing `renderSleepChoice`, `renderStudyGoals` and `renderWorkQuestion` with a `"mod"` id prefix); the card title link; `renderTargetRows` removed. Tests in `web/tests/render.test.js`.
- `web/js/app.js`: reading the address and showing the right view, drawing the nav, loading and drawing a module page, its log save, Edit / Save / Cancel using the existing `readSleepChoice`, `checkStudy`, `readWorkAnswer` and their `with...` helpers; the old nav handlers and the three Settings handlers removed.
- `web/preview.html`: the nav and one module page.
- Docs: `README.md`, `FEATURES.md`, `docs/qa-checklist.md`, the SDP with a short dated note, `docs/areas/*.md` where they say "Settings > Sleep / Study / Work".

## Left to the builder
- The CSS that makes the layout (grid or flex), exact spacing, and how the nav stays put while scrolling.
- Whether the Home log form and the module log form share one renderer.
- The names of the small helper functions.

## After the build
Claude explains the code in build order: rules, API, HTML, CSS, render.js, then app.js. Each piece gets what it does, why, and how to rebuild it from scratch.

## Verification
- `.venv/Scripts/python.exe -m pytest server/tests`: all green, including new tests:
  - Sleep details with a schedule (with and without 4 bedtimes) and with a goal
  - Study details: dated, undated and passed goals, and none
  - Work details: full profile, schedule, "It varies", empty profile, `limit` mode tip
  - the dashboard carries `dates` (7, oldest first) and `details` for each module that is on
- `node --test "web/tests/*.test.js"`: all green, including the nav (only modules that are on, `aria-current`), the module page (gaps read "not logged", a 0 reads "0 h", escaping) and the card title link.
- A browser script against a **scratch database** on port 8766, so your real `compass.db` is untouched:
  - the nav lists only the modules picked; turning one off in Settings removes it and its address goes Home
  - each address shows its page; reload stays; Back and Forward work; an unknown address goes Home
  - the nav is hidden through onboarding and after Delete everything
  - each module page: This week matches the Home card; logging updates the rows and the week; a blank stays "not logged"
  - Edit, Save and Cancel for Sleep (goal and schedule), Study and Work, with each form's messages; the Home card reflects the change
  - Settings shows only Modules, Habits, Goals, Your data
  - keyboard only: Tab reaches every nav link, focus lands on each page's heading
  - console errors, request hosts (127.0.0.1 only), screenshots at 1280 px and 360 px, no sideways scrolling, the bottom bar not covering the last panel
- You do a short Narrator pass: the nav, a module page's heading, the 7-day table and the Edit form.
- The QA checklist gets new nav and module-page items, ticked with how each was checked; lines about Settings > Targets, Study and Work are marked superseded.

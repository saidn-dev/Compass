# Compass

A personal life dashboard that reads your week at a glance and tells you what to do next.

Compass puts the parts of your life you actually track (sleep, movement, study, work, money, habits, goals) on one page. A short AI-written brief sits at the top: what needs attention today, what is going well, and one concrete next step.

It is built for one person, for daily use, in under five minutes a day.

---

## The problem

Most life-tracking tools fall into one of two traps:

- **Too many inputs.** Apps that want a log for every metric get abandoned within two weeks.
- **Data without direction.** Charts show what happened, but nobody says what to do about it.

Compass keeps the inputs small and makes the output a decision, not a report.

---

## Who it's for

- A student or early-career person balancing classes, part-time or freelance work, and a personal budget.
- Someone who wants a daily check-in, not a productivity system.
- A person who would rather read one honest sentence about their week than scan five charts.

---

## What it does (version 1)

### 1. Daily brief
The first thing on the page. Three to four sentences, generated from the last seven days of data:
- The area furthest behind its target, with the specific number.
- One pattern worth noticing (for example, "sleep drops on Thursdays").
- One suggested action for today, limited to something that takes 30 minutes or less.

### 2. Life areas
Five cards, each with the current value, progress against a target, and a seven-day trend:

| Area | Input | Target example |
|---|---|---|
| Sleep | Hours per night | 7.5 h average |
| Movement | Steps per day | 8,000 |
| Study | Hours per week | 12 h |
| Work | Paid hours per week | 16 h |
| Spending | Percent of monthly budget used | 100% limit |

Targets are yours to set. Each card shows status ("On track" or "Behind") in plain words, not color alone.

### 3. Today's focus
Up to three tasks for the day, with a checkbox for each. Completed tasks stay visible but muted until tomorrow.

### 4. Habits
A seven-day grid of yes/no habits (for example: morning walk, reading, no phone before 8, deep work block). Each habit is one tap per day. The page shows a weekly completion rate.

### 5. Goals
Three or fewer active goals, each with a percent complete and one line of context. Goals are edited by hand, not inferred.

### 6. Quick capture
A notes box for thoughts that don't fit elsewhere. It saves automatically.

---

## What it does not do (on purpose)

- **No social feeds, streaks shaming, or badges.** Missing a day should not make the page feel like a failure.
- **No automatic tracking of your private messages or browsing.** Compass only uses what you enter or explicitly connect.
- **No medical advice.** Sleep and movement numbers are for awareness. If something feels wrong, the brief says to talk to a doctor, not to change a dose or diet.
- **No financial advice.** Spending shows against a budget you set. It does not recommend investments or products.
- **No more than five life areas in version 1.** More areas means more daily work and weaker answers.

---

## How the AI works

Compass is designed to run in two modes, and version 1 uses the first.

**Mode A: rules-based brief (version 1).** Simple, free, and fully offline. The brief is built from fixed rules: which area is furthest behind, average values, the weakest day, habit completion. It is predictable and easy to check.

**Mode B: model-written brief (later).** An AI model rewrites the rule-based facts into natural language and can notice patterns the rules miss. It gets only your numbers and the targets you set, never raw notes. The model cannot change the facts. If it is unavailable, the page falls back to Mode A.

The brief always shows the numbers it used, so you can check it.

---

## Privacy

- Data is stored in your browser (version 1). Nothing is sent to a server.
- If Mode B is enabled, only the summarised numbers for the last seven days are sent to the model provider. Quick capture notes are never sent unless you turn that on.
- You can export everything as a single JSON file and delete it all from the settings screen.

---

## Data model

```
Day {
  date: "2026-10-20"
  sleep_hours: number | null
  steps: number | null
  study_hours: number | null
  work_hours: number | null
  spend_pct_of_budget: number | null
  habits: { [habit_id]: boolean }
  tasks: [{ text, done }]
  note: string
}

Target {
  area_id: string
  target: number
  mode: "up" | "limit"      // "up" = more is better, "limit" = stay under
}

Goal {
  name: string
  percent: number           // 0 to 100
  detail: string
}
```

Missing values are shown as gaps, never as zero. A gap does not count against you in the brief.

---

## Screens

1. **Home (the only screen in version 1).** Brief, life areas, focus, habits, goals, quick capture, in that order.
2. **Settings.** Targets, habit list, goal list, theme (light, dark, system), export and delete.

Layout is one column on phones, a two- or three-column grid on wider screens. Light and dark themes both follow the system setting by default.

---

## Tech (version 1)

- One HTML file, no build step, no framework.
- Plain CSS with theme tokens for light and dark.
- Storage in `localStorage`, with a JSON export.
- No external requests.

This keeps setup to "open the file" and makes the code easy to read and change.

---

## Roadmap

**Version 1: Standalone page (current build)**
- Rules-based brief
- Five life areas, habits, goals, focus, quick capture
- Local storage and JSON export

**Version 2: Smarter brief**
- Optional model-written brief, with rule-based fallback
- Weekly review screen that compares this week to the last four
- Gentle suggestions for habits that keep getting skipped

**Version 3: Connections (optional)**
- Import sleep and steps from a phone health app or a CSV export
- Calendar import for study and work hours
- Hosted version with sign-in, if you want to use it across devices

Each version stays optional. The core page should work fine with no connections at all.

---

## Success measures

Compass is working if, after four weeks:

- You open it at least five days a week.
- Logging a full day takes under five minutes.
- You can name one thing you changed because of the brief.
- You stop checking it out of habit and start using it to decide something.

---

## Open questions

- Should the brief run once each morning, or update live as you log?
- Should weekends use different targets?
- Is a seven-day window enough, or should the brief look at a longer period once there is data?

---

## Status

Concept and version 1 prototype. Feedback welcome.

---

## Getting started

1. Open `compass.html` in any modern browser.
2. Go to **Settings** and set one target per area.
3. Log today's numbers. Leave anything you don't know blank.
4. Read the brief. Do one thing it suggests.
# Work

How Compass handles it now:

- Field: `work_hours` (hours), added up over 7 days. For someone looking for work it holds hours spent searching, and the log field is labelled "Job search" instead of "Paid work".
- Default target: 16 h a week, mode `up` (higher is better)
- Target from the profile: a work type sets the mode ("Employed" is `limit`, "Stay under"; every other type is `up`). A schedule (days, start, end) sets the target to days times the hours between start and end, up to 168 h. "It varies" saves the typed hours a week and clears the schedule. Skipping every question keeps 16 h, `up`; an employed user with no schedule and no "It varies" hours gets 40 h (`limit`) unless they saved a different target.
- Tips (the brief's third sentence when Work is the area it is about):
  - Mode `limit`: "Pick a time to stop work today and keep to it."
  - Otherwise the tip for the first ticked derailer in the fixed order below (priorities, procrastination, interruptions, energy, projects; the profile keeps derailers in that order), or the general tip with none. "Something else" alone gives the general tip. `{when}` is "in the morning", "in the afternoon", "in the evening", or "today" for "It varies" or no answer.
  - General: "Block 30 minutes {when} for your most urgent task."
  - Unclear priorities: "Pick the one task that matters most this week and give it 30 minutes {when}."
  - Putting things off: "Spend 10 minutes {when} on the task you've been putting off."
  - Interruptions: "Turn off notifications for one 30-minute block {when}."
  - Low energy: "Do 30 minutes on your hardest task {when}, then take a short break."
  - Too many projects: "Choose one project to move forward {when} and leave the rest for now."
- Work profile (`Settings.work`): `kind`, `role`, `schedule`, `hours_vary`, `focus`, `goal`, `derailers`. Answered on six one-question screens in onboarding, and changed later on the Work page with its Edit button. The profile stays saved when Work is unticked.
- Work card: a line under the target with the role and goal joined by " · ", for example "Software developer · Goal: Fix 3 bugs". One of them alone is shown alone; with neither there is no line. Since 2026-11-13 Home shows one line per module without this text; the role and goal are on the Work page.
- Defined in `server/app/areas.py:36` (default target), `server/app/work.py` (`week_hours` at line 27, `work_tip` at 32, `work_card` at 44), `server/app/models.py:202` (`WorkProfile`) and `server/app/settings_rules.py:66` (`sync_work_target`). The tip is used at `server/app/brief.py:118` and the card line at `server/app/dashboard.py:53`.

## Notes

## Ideas

## Questions

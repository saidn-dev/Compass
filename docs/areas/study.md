# Study

How Compass handles it now:

- Field: `study_hours` (hours), added up over 7 days
- Default target: 12 h a week, mode `up` (higher is better)
- Tip when behind: "Do one 30-minute study block on your nearest deadline."
- Study goals: 1 to 5 set on the onboarding Study page, each a name and an optional date (`Settings.study_goals`); changed later on the Study page with its Edit button
- Study card: shows the nearest goal and how far away it is ("in 12 days", "today", "tomorrow", "date passed" for up to 7 days) Since 2026-11-13 Home shows one line per module without this text; every goal and its countdown is on the Study page.
- Brief: one line about the nearest dated goal. It replaces the pattern sentence when Study is the focus.
- Defined in `server/app/areas.py:34` and `server/app/study.py`

## Notes

## Ideas

## Questions

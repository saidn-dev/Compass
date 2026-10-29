# Sleep

How Compass handles it now:

- Field: `sleep_hours` (hours), averaged over 7 days
- Default target: 7.5 h, mode `up` (higher is better)
- Tip when behind: "Set a wind-down alarm 30 minutes before bed tonight."
- Safety line: if the 7-day average is under 5 h, the brief adds a "talk to a doctor" sentence
- Defined in `server/app/areas.py:31`

## Notes

## Ideas

## Questions

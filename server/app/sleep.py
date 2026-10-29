"""Sleep rules: clock times, hours slept from bed and wake times, and the
"Let's work it out" suggestion from onboarding.

Times are "HH:MM" on a 24-hour clock. Anything else is a gap (None), never a guess.
Suggestions are general guidance (US National Sleep Foundation ranges), not medical advice.
Imports nothing from app, so models.py can use it.
"""
import re
from typing import Literal

TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$")
MINUTES_A_DAY = 24 * 60
LATE_GRACE_MINUTES = 30  # in bed up to this long after the planned bedtime still counts as on time

Age = Literal["under_18", "18_25", "26_64", "65_plus"]
Role = Literal["student", "employed", "self_employed", "shift_worker", "unemployed", "other"]
HabitId = Literal["alcohol", "caffeine", "screens", "naps", "late_meals", "nicotine"]

# Age bracket: (hours to suggest, the range shown next to it)
AGES: dict[str, tuple[float, str]] = {
    "under_18": (9, "8-10 h"),
    "18_25": (8, "7-9 h"),
    "26_64": (8, "7-9 h"),
    "65_plus": (7.5, "7-8 h"),
}
DEFAULT_AGE = (8, "7-9 h")

# One tip per habit, in the order the page lists them.
HABIT_TIPS: dict[str, str] = {
    "alcohol": "Stop drinking alcohol about 3 hours before bed.",
    "caffeine": "Have your last coffee or tea before 2 pm.",
    "screens": "Put screens away 30 minutes before bed.",
    "naps": "Keep naps under 30 minutes and before 3 pm.",
    "late_meals": "Finish big meals 2 to 3 hours before bed.",
    "nicotine": "Avoid smoking or vaping close to bedtime.",
}
SHIFT_NOTE = "Shift work makes a fixed schedule hard; an hours-a-night goal may suit you better."


def parse_time(value: object) -> str | None:
    """"22:30" stays "22:30", "23:00:00" becomes "23:00", anything else is None."""
    if not isinstance(value, str):
        return None
    match = TIME_PATTERN.match(value.strip())
    return f"{match[1]}:{match[2]}" if match else None


def _minutes(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def _clock(minutes: int) -> str:
    minutes %= MINUTES_A_DAY
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def hours_between(bedtime: str, wake_time: str) -> float | None:
    """Hours from bedtime to wake time, past midnight if needed. Equal times are a gap."""
    gap = (_minutes(wake_time) - _minutes(bedtime)) % MINUTES_A_DAY
    return round(gap / 60, 2) if gap else None


def minutes_late(actual: str, planned: str) -> int:
    """How many minutes after the planned time; negative means early. 00:15 vs 23:30 is 45."""
    diff = (_minutes(actual) - _minutes(planned)) % MINUTES_A_DAY
    return diff - MINUTES_A_DAY if diff >= MINUTES_A_DAY // 2 else diff


def time_minus_hours(hhmm: str, hours: float) -> str:
    """The clock time `hours` before hhmm: 06:30 minus 8 is 22:30."""
    return _clock(_minutes(hhmm) - round(hours * 60))


def suggest(age: str | None, role: str | None, habits: list[str], wake_time: str | None) -> dict:
    """A suggested sleep goal, and a schedule when there is a wake time. Skipped answers are None."""
    hours, range_text = AGES.get(age, DEFAULT_AGE)
    wake = None
    if wake_time:
        wake = parse_time(wake_time)
        if wake is None:
            raise ValueError("Wake-up time must look like HH:MM.")

    notes = []
    if role == "shift_worker":
        notes.append(SHIFT_NOTE)
        wake = None  # a fixed schedule may not fit, so suggest hours only

    return {
        "hours": hours,
        "range": range_text,
        "bedtime": time_minus_hours(wake, hours) if wake else None,
        "wake_time": wake,
        "tips": [tip for habit, tip in HABIT_TIPS.items() if habit in habits],
        "notes": notes,
    }

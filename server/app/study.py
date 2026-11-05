"""Rules for study goals: days left, the nearest goal, and how it is worded.

"Today" always comes from the caller (the dashboard's date), never the clock here.
"""
from datetime import date

from app.models import StudyGoal

PASSED_GRACE_DAYS = 7


def days_left(date_key: str, today: str) -> int:
    """Whole days from today to the date: today is 0, tomorrow 1, yesterday -1."""
    return (date.fromisoformat(date_key) - date.fromisoformat(today)).days


def when_text(days: int) -> str:
    if days < 0:
        return "date passed"
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days} days"


def nearest_goal(goals: list[StudyGoal], today: str) -> StudyGoal | None:
    """The closest goal on or after today; else the latest one passed within 7 days."""
    dated = [(days_left(g.date, today), g) for g in goals if g.date]
    upcoming = [(d, g) for d, g in dated if d >= 0]
    if upcoming:
        return min(upcoming, key=lambda p: p[0])[1]
    recent = [(d, g) for d, g in dated if d >= -PASSED_GRACE_DAYS]
    if recent:
        return max(recent, key=lambda p: p[0])[1]
    return None


def card_goal(goals: list[StudyGoal], today: str) -> dict | None:
    """What the Study card shows: the nearest goal and its countdown, or an undated goal's name."""
    goal = nearest_goal(goals, today)
    if goal is not None:
        d = days_left(goal.date, today)
        return {"name": goal.name, "date": goal.date, "days_left": d,
                "text": f"{goal.name} · {when_text(d)}"}
    undated = next((g for g in goals if g.date is None), None)
    if undated is not None:
        return {"name": undated.name, "date": None, "days_left": None, "text": undated.name}
    return None


def study_line(goals: list[StudyGoal], today: str) -> tuple[str, dict, bool] | None:
    """The brief's sentence about the nearest goal, its fact, and whether it is still to come."""
    goal = nearest_goal(goals, today)
    if goal is None:
        return None
    d = days_left(goal.date, today)
    upcoming = d >= 0
    text = f"{goal.name} is {when_text(d)}." if upcoming else f"The date for {goal.name} has passed."
    fact = {"area_id": "study", "kind": "deadline", "name": goal.name, "date": goal.date, "days_left": d}
    return text, fact, upcoming

"""What each module's own page shows under its numbers: a title and a few lines of text.

Sleep: the goal or schedule. Study: every goal with its countdown. Work: role,
goal, hours and this week's tip. The page shows these lines as they are.
"""
from app.brief import _fmt, bedtime_line
from app.models import Settings
from app.settings_rules import target_for
from app.study import days_left, when_text
from app.work import week_hours, work_tip

PERIODS = {"avg": "average a night", "sum": "this week"}
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _sleep(settings: Settings, window: list[dict]) -> dict:
    schedule = settings.sleep_schedule
    if schedule is None:
        hours = target_for(settings, "sleep").target
        return {"title": "Your goal", "lines": [f"{_fmt(hours)} h a night"]}
    lines = [f"In bed {schedule.bedtime} · Up {schedule.wake_time}"]
    bedtime = bedtime_line(window, schedule.bedtime)
    if bedtime:
        lines.append(bedtime[0])
    return {"title": "Your schedule", "lines": lines}


def _study(settings: Settings, today: str) -> dict:
    lines = [
        f"{g.name} · {when_text(days_left(g.date, today))}" if g.date else g.name
        for g in settings.study_goals
    ]
    return {"title": "Your goals", "lines": lines or ["No study goals yet."]}


def work_days_text(days: list[int]) -> str:
    """[0, 1, 2, 3, 4] -> "Mon to Fri"; days that aren't one run -> "Mon, Wed, Fri"."""
    days = sorted(days)
    one_run = len(days) >= 2 and days[-1] - days[0] == len(days) - 1
    if one_run:
        return f"{DAY_NAMES[days[0]]} to {DAY_NAMES[days[-1]]}"
    return ", ".join(DAY_NAMES[d] for d in days)


def _work(settings: Settings) -> dict:
    profile = settings.work
    target = target_for(settings, "work")
    lines = []
    if profile.role:
        lines.append(profile.role)
    if profile.goal:
        lines.append(f"Goal: {profile.goal}")
    if profile.schedule:
        s = profile.schedule
        lines.append(f"{work_days_text(s.days)}, {s.start} to {s.end} · {_fmt(week_hours(s))} h a week")
    elif profile.hours_vary:
        lines.append(f"Hours vary · {_fmt(target.target)} h a week")
    lines.append(f"This week's tip: {work_tip(profile, target.mode)}")
    return {"title": "Your work", "lines": lines}


def module_details(area_id: str, settings: Settings, window: list[dict], today: str) -> dict:
    """{"title", "lines"} for one module's page. window: the last 7 days, oldest first."""
    if area_id == "sleep":
        return _sleep(settings, window)
    if area_id == "study":
        return _study(settings, today)
    return _work(settings)

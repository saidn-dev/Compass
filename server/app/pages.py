"""What each module's own page shows under its numbers: a title and a few lines of text.

Sleep: the goal or schedule. Study: every goal with its countdown. Work: role,
goal, hours and this week's tip. The page shows these lines as they are.
Also the contributors: the bars that show what went into this week's score.
"""
from app.areas import area_score, area_value, effective_target, score_words
from app.brief import _fmt, bedtime_line, round_value
from app.models import Settings
from app.settings_rules import AREAS_BY_ID, target_for
from app.sleep import LATE_GRACE_MINUTES, minutes_late
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


def _contributor(label: str, text: str, score: int | None) -> dict:
    return {"label": label, "text": text, "score": score, "level": score_words(score)[0]}


def module_contributors(area_id: str, settings: Settings, window: list[dict]) -> list[dict]:
    """The bars under a module's score: what went into this week's number.

    Hours (the week's value against its target), Bedtime (for a sleep schedule: nights in
    bed on time) and Logging (how many of the 7 days have a number).
    """
    area = AREAS_BY_ID[area_id]
    target = target_for(settings, area_id)
    value = area_value(area, window)
    if value is None:
        hours = _contributor("Hours", "Not logged", None)
    else:
        shown = round_value(area, value)
        hours = _contributor("Hours", f"{_fmt(shown)} {area.unit} {PERIODS[area.aggregate]}",
                             area_score(shown, effective_target(area, target.target, window), target.mode))
    rows = [hours]

    if area_id == "sleep" and settings.sleep_schedule is not None:
        planned = settings.sleep_schedule.bedtime
        bedtimes = [d["bedtime"] for d in window if d.get("bedtime")]
        if bedtimes:
            on_time = sum(minutes_late(b, planned) <= LATE_GRACE_MINUTES for b in bedtimes)
            rows.append(_contributor("Bedtime", f"{on_time} of {len(bedtimes)} nights on time",
                                     round(on_time / len(bedtimes) * 100)))
        else:
            rows.append(_contributor("Bedtime", "No bedtimes logged", None))

    # A rest day with nothing logged isn't a missed day (for weekly totals).
    excused = sum(d.get("rest") is True and d.get(area.field) is None for d in window) if area.aggregate == "sum" else 0
    expected = len(window) - excused
    logged = sum(d.get(area.field) is not None for d in window)
    share = round(logged / expected * 100) if expected else None
    rows.append(_contributor("Logging", f"{logged} of {expected} days", share))
    return rows

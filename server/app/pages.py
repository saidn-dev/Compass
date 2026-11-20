"""What each module's own page shows under its numbers: a title and a few lines of text.

Sleep: the goal or schedule. Study: every goal with its countdown. Work: role,
goal, hours and this week's tip. The page shows these lines as they are.
Also the contributors: the bars that show what went into this week's score.
"""
from app.areas import TOP_LEVELS, area_score, area_value, effective_target, score_words
from app.brief import _fmt, bedtime_line, round_value
from app.models import Settings
from app.progress import goal_pace
from app.settings_rules import AREAS_BY_ID, target_for
from app.sleep import LATE_GRACE_MINUTES, minutes_late
from app.focus import duration_text
from app.study import days_left, goal_sessions, when_text
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


def _sessions_text(minutes: int, count: int, hours: float | None) -> str:
    """"8 sessions · 3 h 20 min of 40 h", "1 session · 25 min" or "No sessions yet"."""
    if count == 0:
        return "No sessions yet"
    total = duration_text(minutes) + (f" of {_fmt(hours)} h" if hours else "")
    return f"{count} session{'' if count == 1 else 's'} · {total}"


def _study(settings: Settings, today: str, days: list[dict]) -> dict:
    """Each goal with its countdown and hours, then its pace line when it has one.

    "goals" carries the same goals for the page to draw: the countdown, the session total
    (sessions whose task is the goal's name), the pace line and the steps.
    """
    lines, goals = [], []
    for i, g in enumerate(settings.study_goals):
        parts = [g.name]
        if g.date:
            parts.append(when_text(days_left(g.date, today)))
        if g.hours:
            parts.append(f"{_fmt(g.hours)} h")
        lines.append(" · ".join(parts))
        pace = goal_pace(g, days, today)
        if pace:
            lines.append(pace)
        minutes, count = goal_sessions(g.name, days)
        done = sum(s.done for s in g.steps)
        goals.append({
            "index": i,
            "name": g.name,
            "when": when_text(days_left(g.date, today)) if g.date else None,
            "sessions": _sessions_text(minutes, count, g.hours),
            "pace": pace,
            "steps": [s.model_dump() for s in g.steps],
            "steps_text": f"{done} of {len(g.steps)} steps done" if g.steps else None,
        })
    return {"title": "Your goals", "lines": lines or ["No study goals yet."], "goals": goals}


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


def module_details(area_id: str, settings: Settings, window: list[dict], today: str,
                   days: list[dict] | None = None) -> dict:
    """{"title", "lines"} for one module's page. window: the last 7 days, oldest first;
    days: every day loaded (up to 12 weeks), for the study goals' pace."""
    if area_id == "sleep":
        return _sleep(settings, window)
    if area_id == "study":
        return _study(settings, today, days or window)
    return _work(settings)


def _contributor(label: str, text: str, score: int | None, mode: str = "up") -> dict:
    return {"label": label, "text": text, "score": score, "level": score_words(score, mode)[0]}


# The Hours line reads "4 of 10 h this week" or "6.5 of 7.5 h a night on average".
HOURS_PERIODS = {"avg": "a night on average", "sum": "this week"}
LATE_NIGHTS_OK = 2  # 1-2 late nights is Ok, more is Too much


def _late_nights_score(late: int) -> int:
    """Bedtime is a limit: no late nights is Great (100), 1-2 Ok (85), 3 or more Too much."""
    if late == 0:
        return 100
    return 85 if late <= LATE_NIGHTS_OK else 50


def module_contributors(area_id: str, settings: Settings, window: list[dict]) -> list[dict]:
    """The bars under a module's score: what went into this week's number.

    Hours (the week's value against its target), Bedtime (for a sleep schedule: nights in
    bed on time) and Logging (how many of the 7 days have a number).
    """
    area = AREAS_BY_ID[area_id]
    target = target_for(settings, area_id)
    value = area_value(area, window)
    if value is None:
        hours = _contributor("Hours", "Not logged", None, target.mode)
    else:
        shown = round_value(area, value)
        goal = effective_target(area, target.target, window)
        hours = _contributor("Hours", f"{_fmt(shown)} of {_fmt(goal)} {area.unit} {HOURS_PERIODS[area.aggregate]}",
                             area_score(shown, goal, target.mode), target.mode)
    rows = [hours]

    if area_id == "sleep" and settings.sleep_schedule is not None:
        planned = settings.sleep_schedule.bedtime
        bedtimes = [d["bedtime"] for d in window if d.get("bedtime")]
        if bedtimes:
            on_time = sum(minutes_late(b, planned) <= LATE_GRACE_MINUTES for b in bedtimes)
            rows.append(_contributor("Bedtime", f"{on_time} of {len(bedtimes)} nights on time",
                                     _late_nights_score(len(bedtimes) - on_time), "limit"))
        else:
            rows.append(_contributor("Bedtime", "No bedtimes logged", None, "limit"))

    # A rest day with nothing logged isn't a missed day (for weekly totals).
    excused = sum(d.get("rest") is True and d.get(area.field) is None for d in window) if area.aggregate == "sum" else 0
    expected = len(window) - excused
    logged = sum(d.get(area.field) is not None for d in window)
    share = round(logged / expected * 100) if expected else None
    rows.append(_contributor("Logging", f"{logged} of {expected} days", share))
    return rows


def top_reason(contributors: list[dict]) -> str | None:
    """"Mostly hours: 4 of 10 h this week": the weakest contributor below the top level, or None."""
    below = [c for c in contributors if c["score"] is not None and c["level"] not in TOP_LEVELS]
    if not below:
        return None
    weakest = min(below, key=lambda c: c["score"])
    return f"Mostly {weakest['label'].lower()}: {weakest['text']}"

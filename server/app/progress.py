"""Progress over time: the weekly Focus Report and the pace for dated study goals.

Focus means Study and Work hours together, focus sessions included (the days passed in
already carry them; see app/focus.py). A gap is never counted as 0.
"""
import math
from datetime import date, timedelta

from app.areas import last_n_dates
from app.baseline import first_logged
from app.brief import WEEKDAYS, _fmt
from app.focus import duration_text
from app.models import Settings, StudyGoal
from app.study import days_left

REPORT_UNLOCK_DAYS = 7
PACE_DAYS = 14
FOCUS_AREAS = {"study": "study_hours", "work": "work_hours"}


def _day_text(key: str) -> str:
    """"2026-11-27" -> "Thu 27 Nov"."""
    d = date.fromisoformat(key)
    return f"{WEEKDAYS[d.weekday()][:3]} {d.day} {d.strftime('%b')}"


def _hours(h: float) -> str:
    return f"{_fmt(round(h, 1))} h"


def _focus(day: dict, fields: list[str]) -> float | None:
    """A day's focus hours, or None when none of its focus fields were logged."""
    values = [day.get(f) for f in fields if day.get(f) is not None]
    return sum(values) if values else None


def _week_total(by_date: dict[str, dict], keys: list[str], fields: list[str]) -> float | None:
    values = [v for v in (_focus(by_date.get(k, {}), fields) for k in keys) if v is not None]
    return sum(values) if values else None


def focus_report(days: list[dict], settings: Settings, today: str) -> dict | None:
    """The weekly Focus Report, or None when neither Study nor Work is switched on.

    Locked for the first 7 days: {"locked": True, "text"}. Then {"locked": False, "lines"}:
    this week's focus with the best and worst day, this week against the starting point
    (the onboarding estimate, or the first 7 days without one) and the time reclaimed since.
    """
    fields = [FOCUS_AREAS[m] for m in settings.modules if m in FOCUS_AREAS]
    if not fields:
        return None
    by_date = {d["date"]: d for d in days}
    start_point = settings.starting_point
    start = (start_point.date if start_point and start_point.date else None) or first_logged(days)
    if start is None:
        return {"locked": True, "text": "Your first Focus Report unlocks 7 days after you start logging."}
    day_number = (date.fromisoformat(today) - date.fromisoformat(start)).days + 1
    if day_number <= REPORT_UNLOCK_DAYS:
        unlock = (date.fromisoformat(start) + timedelta(days=REPORT_UNLOCK_DAYS)).isoformat()
        return {"locked": True, "day": max(day_number, 1),
                "text": f"Your first Focus Report unlocks on {_day_text(unlock)} · day {max(day_number, 1)} of 7."}

    week_keys = last_n_dates(today, 7)
    total = _week_total(by_date, week_keys, fields)
    lines = []
    if total is None:
        lines.append("This week: no focus logged yet.")
    else:
        lines.append(f"This week: {_hours(total)} of focus.")
        logged = [(k, _focus(by_date.get(k, {}), fields)) for k in week_keys]
        logged = [(k, v) for k, v in logged if v is not None]
        if len(logged) >= 2:
            best = max(logged, key=lambda p: p[1])
            worst = min(logged, key=lambda p: p[1])
            lines.append(f"Best day: {_day_text(best[0])} ({_hours(best[1])}). "
                         f"Lightest day: {_day_text(worst[0])} ({_hours(worst[1])}).")

    estimates = [getattr(start_point, f, None) for f in fields] if start_point else []
    estimates = [e for e in estimates if e is not None]
    if estimates:
        pace, basis = sum(estimates), f"your starting estimate of {_hours(sum(estimates))} a week"
    else:
        first_week = _week_total(by_date, [(date.fromisoformat(start) + timedelta(days=i)).isoformat()
                                           for i in range(7)], fields)
        pace = first_week
        basis = None if first_week is None else f"your first week ({_hours(first_week)})"

    if pace is not None and total is not None:
        diff = round(total - pace, 1)
        if diff > 0:
            lines.append(f"{_hours(diff)} a week over {basis}.")
        elif diff < 0:
            lines.append(f"{_hours(-diff)} under {basis} this week.")
        else:
            lines.append(f"The same as {basis}.")

        reclaimed = 0.0
        end = date.fromisoformat(today)
        while (end - timedelta(days=6)).isoformat() >= start:
            keys = [(end - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
            week = _week_total(by_date, keys, fields)
            if week is not None:
                reclaimed += max(0.0, week - pace)
            end -= timedelta(days=7)
        if reclaimed > 0:
            lines.append(f"Since you started: {_hours(reclaimed)} reclaimed.")
        else:
            lines.append("Since you started: weeks above your starting pace add up here.")
    return {"locked": False, "lines": lines}


def _rounded_minutes(hours: float) -> int:
    """Hours as whole minutes, rounded up to the next 5 so the advice is enough."""
    return max(5, math.ceil(hours * 60 / 5) * 5)


def goal_pace(goal: StudyGoal, days: list[dict], today: str) -> str | None:
    """"At this pace you'll reach X by Thu 27 Nov, 2 days late. 30 min more a day closes it."

    Counts the focus sessions whose task is the goal's name. None without a date still to come
    or an hours estimate.
    """
    if not goal.date or not goal.hours:
        return None
    left = days_left(goal.date, today)
    if left < 0:
        return None
    sessions = [(d["date"], s["minutes"]) for d in days for s in d.get("sessions", [])
                if s.get("area") == "study" and s.get("task") == goal.name]
    done = sum(m for _, m in sessions) / 60
    remaining = goal.hours - done
    if remaining <= 0:
        return f"{goal.name}: all {_fmt(goal.hours)} h done."

    recent_keys = set(last_n_dates(today, PACE_DAYS))
    per_day = sum(m for k, m in sessions if k in recent_keys) / 60 / PACE_DAYS
    days_to_go = max(left, 1)
    if per_day == 0:
        need = duration_text(_rounded_minutes(remaining / days_to_go))
        return (f"No sessions on {goal.name} in the last {PACE_DAYS} days. "
                f"{need} a day gets you there by {_day_text(goal.date)}.")

    finish = date.fromisoformat(today) + timedelta(days=math.ceil(remaining / per_day))
    late = (finish - date.fromisoformat(goal.date)).days
    if late > 0:
        extra = duration_text(_rounded_minutes(remaining / days_to_go - per_day))
        return (f"At this pace you'll reach {goal.name} by {_day_text(finish.isoformat())}, "
                f"{late} day{'' if late == 1 else 's'} late. {extra} more a day closes it.")
    if late == 0:
        return f"At this pace you'll reach {goal.name} right on {_day_text(goal.date)}."
    early = -late
    return (f"At this pace you'll be ready for {goal.name} by {_day_text(finish.isoformat())}, "
            f"{early} day{'' if early == 1 else 's'} early.")

"""Focus sessions: time spent with the timer on the Study and Work pages.

A session is saved on the day it started: {id, area, task, minutes, ended_at, note}.
Its minutes count as Study or Work hours wherever hours are read (with_focus_hours),
while the hours typed into the log stay stored on their own.
A session never ticks a focus task: it only logs time.
"""
import secrets
from datetime import date

from app.areas import last_n_dates
from app.models import MAX_SESSIONS, SESSION_AREAS, Settings, clean_session

HOUR_FIELDS = {"study": "study_hours", "work": "work_hours"}
MAX_DAY_HOURS = 24
YEAR_DAYS = 53 * 7  # the Focus page's year grid: 53 full weeks


def add_session(day: dict, raw: dict) -> dict:
    """day with one more session. The id is made here. Raises ValueError if the day is full."""
    if len(day["sessions"]) >= MAX_SESSIONS:
        raise ValueError(f"You can save up to {MAX_SESSIONS} focus sessions a day.")
    session = clean_session({**raw, "id": secrets.token_hex(4)})
    if session is None:
        raise ValueError("That focus session isn't valid.")
    return {**day, "sessions": [*day["sessions"], session]}


def remove_session(day: dict, session_id: str) -> dict:
    """day without that session. Raises LookupError if there is no such session."""
    kept = [s for s in day["sessions"] if s["id"] != session_id]
    if len(kept) == len(day["sessions"]):
        raise LookupError(session_id)
    return {**day, "sessions": kept}


def edit_session(day: dict, session_id: str, changes: dict) -> dict:
    """day with one session changed (minutes, ended_at, task, note). The id and area stay.

    Raises LookupError if there is no such session, ValueError if the result isn't valid.
    """
    for i, old in enumerate(day["sessions"]):
        if old["id"] == session_id:
            allowed = {k: v for k, v in changes.items() if k in ("minutes", "ended_at", "task", "note")}
            session = clean_session({**old, **allowed})
            if session is None:
                raise ValueError("That focus session isn't valid.")
            return {**day, "sessions": [*day["sessions"][:i], session, *day["sessions"][i + 1:]]}
    raise LookupError(session_id)


def _clock(text: str) -> int:
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def minutes_by_hour(sessions: list[dict]) -> list[int]:
    """Focus minutes in each hour of the day (0-23), each session spread over the hours it
    ran: a session saved at 10:20 after 50 minutes gives 30 to 9:00 and 20 to 10:00.
    A session that began before midnight wraps to the evening before."""
    hours = [0] * 24
    for s in sessions:
        end = _clock(s["ended_at"])
        for minute in range(end - s["minutes"], end):
            hours[(minute % 1440) // 60] += 1
    return hours


def _minutes(sessions: list[dict], area: str | None = None) -> int:
    return sum(s["minutes"] for s in sessions if area is None or s["area"] == area)


def with_focus_hours(days: list[dict]) -> list[dict]:
    """Copies of the days whose Study and Work hours include their sessions.

    Typed-in hours + session minutes / 60, at most 24 a day. A day with neither
    stays a gap (None), never 0. The days passed in are not changed.
    """
    result = []
    for day in days:
        sessions = day.get("sessions") or []
        if sessions:
            day = dict(day)
            for area, field in HOUR_FIELDS.items():
                minutes = _minutes(sessions, area)
                if minutes:
                    day[field] = round(min(MAX_DAY_HOURS, (day.get(field) or 0) + minutes / 60), 2)
        result.append(day)
    return result


def duration_text(minutes: int) -> str:
    """25 -> "25 min", 60 -> "1 h", 110 -> "1 h 50 min"."""
    hours, rest = divmod(round(minutes), 60)
    if not hours:
        return f"{rest} min"
    return f"{hours} h" if not rest else f"{hours} h {rest} min"


def focus_summary(days: list[dict], today: str) -> dict:
    """Today's sessions (count, minutes, minutes per area) and the last 7 days' (count, minutes)."""
    by_date = {d["date"]: d for d in days}
    todays = by_date.get(today, {}).get("sessions", [])
    week = [s for key in last_n_dates(today, 7) for s in by_date.get(key, {}).get("sessions", [])]
    return {
        "today": {"count": len(todays), "minutes": _minutes(todays),
                  **{area: _minutes(todays, area) for area in SESSION_AREAS}},
        "week": {"count": len(week), "minutes": _minutes(week)},
    }


def focus_page(days: list[dict], settings: Settings, today: str) -> dict:
    """Everything the Focus page needs: summary, 14-day log, per-task time and chart buckets.

    Only Study and Work sessions from switched-on modules count. Minutes in a day or week
    with no sessions are a real zero, unlike a blank logged number, which is a gap.
    """
    # Imported here because insights.py imports focus_review_line from this module.
    from app.insights import HISTORY_WEEKS, _short_date

    areas = [area for area in SESSION_AREAS if area in settings.modules]
    by_date = {d["date"]: d for d in days}

    def sessions_in(dates: list[str]) -> list[tuple[str, dict]]:
        return [(key, s) for key in dates
                for s in by_date.get(key, {}).get("sessions", []) if s.get("area") in areas]

    week_dates = last_n_dates(today, 7)
    all_dates = last_n_dates(today, HISTORY_WEEKS * 7)

    # Reuse the existing summary, but drop switched-off areas and add per-area week totals.
    filtered = [{**d, "sessions": [s for s in d.get("sessions", []) if s.get("area") in areas]}
                for d in days]
    summary = focus_summary(filtered, today)
    week_pairs = sessions_in(week_dates)
    for group in (summary["today"], summary["week"]):
        for area in SESSION_AREAS:
            if area not in areas:
                group.pop(area, None)
    summary["week"].update({area: _minutes([s for _, s in week_pairs], area) for area in areas})

    log = []
    for key in reversed(last_n_dates(today, 14)):
        sessions = [s for _, s in sessions_in([key])]
        if sessions:
            log.append({"date": key, "minutes": _minutes(sessions),
                        "sessions": [dict(s) for s in sessions]})

    goal_names = {g.name for g in settings.study_goals}

    def task_rows(pairs: list[tuple[str, dict]]) -> list[dict]:
        groups: dict[tuple[str, str | None], dict] = {}
        for _, s in pairs:
            key = (s["area"], s.get("task"))
            row = groups.setdefault(key, {"area": s["area"], "task": s.get("task"),
                                          "minutes": 0, "count": 0})
            row["minutes"] += s["minutes"]
            row["count"] += 1
        rows = [{**row, "goal": row["area"] == "study" and row["task"] in goal_names}
                for row in groups.values()]
        return sorted(rows, key=lambda r: (-r["minutes"], r["area"], r["task"] or ""))

    tasks = {"7d": task_rows(week_pairs), "12w": task_rows(sessions_in(all_dates))}

    chart_days = []
    for key in week_dates:
        pairs = sessions_in([key])
        chart_days.append({"date": key,
                           **{area: _minutes([s for _, s in pairs], area) for area in SESSION_AREAS}})
    weeks = []
    for start in range(0, len(all_dates), 7):
        chunk = all_dates[start:start + 7]
        pairs = sessions_in(chunk)
        weeks.append({"label": _short_date(chunk[0]),
                      **{area: _minutes([s for _, s in pairs], area) for area in SESSION_AREAS}})

    # The year grid: every day of the last 53 weeks, oldest first (a real zero with no sessions).
    year = [{"date": key, "minutes": _minutes([s for _, s in sessions_in([key])])}
            for key in last_n_dates(today, YEAR_DAYS)]
    # Most focused time: minutes per hour of the day over the 12 weeks.
    hours = minutes_by_hour([s for _, s in sessions_in(all_dates)])
    # Every session of the last 53 weeks, for the stats page's Day / Week / Month periods.
    sessions = [{"date": key, **s} for key, s in sessions_in(last_n_dates(today, YEAR_DAYS))]

    every = [(d["date"], s) for d in days if d["date"] <= today
             for s in d.get("sessions", []) if s.get("area") in areas]
    return {"summary": summary, "log": log, "tasks": tasks, "days": chart_days, "weeks": weeks,
            "year": year, "hours": hours, "sessions": sessions,
            "achievements": achievements(every, settings.focus.daily_goal)}


# Achievements, after TickTick's levels: a level from all-time focus hours, and badges.
LEVEL_HOURS = (0, 2, 5, 10, 20, 40, 70, 100, 150, 250, 400, 600, 1000)


def longest_run(dates: list[str]) -> int:
    """The most days in a row among these dates (YYYY-MM-DD, any order, repeats allowed)."""
    days = sorted({date.fromisoformat(d) for d in dates})
    best = run = 0
    for i, day in enumerate(days):
        run = run + 1 if i and (day - days[i - 1]).days == 1 else 1
        best = max(best, run)
    return best


def achievements(pairs: list[tuple[str, dict]], daily_goal: int) -> dict:
    """The level and badges from every session ever: pairs of (date, session).

    The level rises at each LEVEL_HOURS step; progress is the share of the way to the next.
    A badge is earned once and stays earned. Goal badges count only while a goal is set.
    """
    minutes = sum(s["minutes"] for _, s in pairs)
    hours = minutes / 60
    level = sum(1 for step in LEVEL_HOURS if hours >= step)
    floor = LEVEL_HOURS[level - 1]
    top = LEVEL_HOURS[level] if level < len(LEVEL_HOURS) else None
    progress = 1.0 if top is None else round((hours - floor) / (top - floor), 3)

    per_day: dict[str, int] = {}
    for key, s in pairs:
        per_day[key] = per_day.get(key, 0) + s["minutes"]
    streak = longest_run(list(per_day))
    goal_days = sum(1 for m in per_day.values() if daily_goal and m >= daily_goal)
    ends = [_clock(s["ended_at"]) for _, s in pairs]
    early = any(end - s["minutes"] < 7 * 60 and end - s["minutes"] >= 0 for end, (_, s) in zip(ends, pairs))
    late = any(end >= 23 * 60 or end - s["minutes"] < 0 for end, (_, s) in zip(ends, pairs))

    badges = [
        ("first", "First session", "Finish a focus session", len(pairs) >= 1),
        ("hours-10", "10 hours", "Focus for 10 hours in all", hours >= 10),
        ("hours-100", "100 hours", "Focus for 100 hours in all", hours >= 100),
        ("sessions-100", "100 sessions", "Save 100 focus sessions", len(pairs) >= 100),
        ("streak-7", "7-day streak", "Focus 7 days in a row", streak >= 7),
        ("streak-30", "30-day streak", "Focus 30 days in a row", streak >= 30),
        ("goal-7", "Goal met 7 times", "Reach your daily goal on 7 days", goal_days >= 7),
        ("early", "Early start", "Start a session before 7:00", early),
        ("late", "Late finish", "Finish a session after 23:00", late),
    ]
    return {
        "level": level, "hours": round(hours, 1), "next_hours": top, "progress": progress,
        "sessions": len(pairs), "longest_streak": streak, "goal_days": goal_days,
        "badges": [{"id": i, "label": label, "how": how, "earned": earned}
                   for i, label, how, earned in badges],
    }


def focus_review_line(week: list[dict], before: list[dict]) -> str | None:
    """"Focus sessions: 9 (4 h 10 min), up from 3 h 5 min." for the weekly review, or None."""
    now = [s for d in week for s in d.get("sessions", [])]
    if not now:
        return None
    minutes = _minutes(now)
    line = f"Focus sessions: {len(now)} ({duration_text(minutes)})"
    earlier = [s for d in before for s in d.get("sessions", [])]
    if earlier:
        before_minutes = _minutes(earlier)
        if before_minutes == minutes:
            line += ", same as the week before"
        else:
            line += f", {'up' if minutes > before_minutes else 'down'} from {duration_text(before_minutes)}"
    return line + "."

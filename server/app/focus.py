"""Focus sessions: time spent with the timer on the Study and Work pages.

A session is saved on the day it started: {id, area, task, minutes, ended_at}.
Its minutes count as Study or Work hours wherever hours are read (with_focus_hours),
while the hours typed into the log stay stored on their own.
A session never ticks a focus task: it only logs time.
"""
import secrets

from app.areas import last_n_dates
from app.models import MAX_SESSIONS, SESSION_AREAS, clean_session

HOUR_FIELDS = {"study": "study_hours", "work": "work_hours"}
MAX_DAY_HOURS = 24


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

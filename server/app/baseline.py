"""Your own normal: the learning period, the last 14 days and your usual range.

For the first 14 days after your first log, Compass is "learning your rhythm" and shows no
usual range. After that, each area compares its last 14 days with your usual: the middle
half of the last 12 weeks (nightly values for an average like Sleep, weekly totals for
Study and Work). Days and weeks with nothing logged are left out, never counted as 0.
"""
from datetime import date

from app.areas import Area, area_value, last_n_dates
from app.brief import _fmt, round_value

LEARNING_DAYS = 14
RECENT_DAYS = 14
USUAL_WEEKS = 12
MIN_USUAL_NIGHTS = 7
MIN_USUAL_WEEKS = 2
LOGGED_FIELDS = ("sleep_hours", "study_hours", "work_hours")
PLACES = {
    "above": "Above your usual ▲",
    "within": "Within your usual",
    "below": "Below your usual ▼",
}
PER = {"avg": "a night", "sum": "a week"}


def first_logged(days: list[dict]) -> str | None:
    """The earliest date with any hours or a focus session, or None."""
    logged = [d["date"] for d in days
              if any(d.get(f) is not None for f in LOGGED_FIELDS) or d.get("sessions")]
    return min(logged) if logged else None


def learning_day(days: list[dict], today: str) -> int | None:
    """Which day of the learning period today is (1 to 14), or None (no data yet, or learnt)."""
    first = first_logged(days)
    if first is None:
        return None
    day = (date.fromisoformat(today) - date.fromisoformat(first)).days + 1
    return day if 1 <= day <= LEARNING_DAYS else None


def learning_text(day: int) -> str:
    return f"Learning your rhythm · day {day} of {LEARNING_DAYS}"


def percentile(values: list[float], share: float) -> float:
    """The value at that share (0 to 1) of the sorted values, between neighbours if needed."""
    ordered = sorted(values)
    spot = (len(ordered) - 1) * share
    low = int(spot)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (spot - low)


def _weekly_totals(area: Area, by_date: dict[str, dict], today: str) -> list[float | None]:
    """Each of the last 12 weeks' values, oldest first; a week with nothing logged is None."""
    dates = last_n_dates(today, USUAL_WEEKS * 7)
    return [area_value(area, [by_date.get(k, {}) for k in dates[i:i + 7]]) for i in range(0, len(dates), 7)]


def usual(area: Area, by_date: dict[str, dict], today: str) -> dict | None:
    """{recent, low, high, place, text} for one area, or None with too little data.

    recent: the last 14 days (an average a night, or an average a week).
    low/high: the middle half of your last 12 weeks.
    """
    if area.aggregate == "avg":
        dates = last_n_dates(today, USUAL_WEEKS * 7)
        values = [by_date[k][area.field] for k in dates
                  if k in by_date and by_date[k].get(area.field) is not None]
        if len(values) < MIN_USUAL_NIGHTS:
            return None
        recent = area_value(area, [by_date.get(k, {}) for k in last_n_dates(today, RECENT_DAYS)])
    else:
        weeks = _weekly_totals(area, by_date, today)
        values = [w for w in weeks if w is not None]
        if len(values) < MIN_USUAL_WEEKS:
            return None
        last_two = [w for w in weeks[-2:] if w is not None]
        recent = sum(last_two) / len(last_two) if last_two else None
    if recent is None:
        return None

    low, high = (round_value(area, percentile(values, p)) for p in (0.25, 0.75))
    recent = round_value(area, recent)
    place = "above" if recent > high else "below" if recent < low else "within"
    span = _fmt(low) if low == high else f"{_fmt(low)} to {_fmt(high)}"
    per = PER[area.aggregate]
    text = (f"Last 14 days: {_fmt(recent)} {area.unit} {per} · "
            f"your usual {span} {area.unit} · {PLACES[place]}")
    return {"recent": recent, "low": low, "high": high, "place": place, "text": text}

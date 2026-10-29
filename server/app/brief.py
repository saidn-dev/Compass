"""The daily brief: 3-4 plain sentences built from your last 7 days.

Furthest-behind area with its number, one pattern, one action of 30 minutes or
less. Also returns the numbers it used. With a sleep schedule, one more line says
how often you got to bed on time.
"""
from datetime import date

from app.areas import Area, area_value, last_n_dates
from app.models import Settings
from app.settings_rules import AREAS_BY_ID, target_for
from app.sleep import LATE_GRACE_MINUTES, minutes_late

FIRST_BRIEF = "Log today's numbers to get your first brief."
MIN_PATTERN_POINTS = 4
MIN_BEDTIME_NIGHTS = 4
MAX_SENTENCES = 4
LOW_SLEEP_HOURS = 5
LOW_SLEEP_LINE = (
    "Sleeping under five hours a night all week is hard on you; "
    "if it keeps happening, talk to a doctor."
)
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def round_value(area: Area, value: float) -> float:
    """Round the way it is shown, so facts and sentences carry the same number."""
    return round(value) if area.field == "steps" else round(value, 1)


def _fmt(value: float) -> str:
    return str(int(value)) if value == int(value) else str(value)


def _amount(area: Area, value: float) -> str:
    return f"{_fmt(value)}%" if area.unit == "%" else f"{_fmt(value)} {area.unit}"


def _describe(area: Area, value: float, target: float) -> str:
    if area.aggregate == "latest":
        return f"{_amount(area, value)} of budget used against a {_amount(area, target)} limit"
    period = "average" if area.aggregate == "avg" else "this week"
    return f"{_amount(area, value)} {period} against {_amount(area, target)}"


def _behind_by(value: float, target: float, mode: str) -> float:
    return (target - value) / target if mode == "up" else (value - target) / target


def bedtime_line(window: list[dict], planned: str) -> tuple[str, dict] | None:
    """"In bed after 22:30 on 3 of 6 nights." and its fact, or None with fewer than 4 bedtimes."""
    bedtimes = [d["bedtime"] for d in window if d.get("bedtime")]
    if len(bedtimes) < MIN_BEDTIME_NIGHTS:
        return None
    late = sum(minutes_late(b, planned) > LATE_GRACE_MINUTES for b in bedtimes)
    n = len(bedtimes)
    if late == 0:
        text = f"In bed by {planned} on all {n} nights."
    else:
        text = f"In bed after {planned} on {late} of {n} nights."
    return text, {"area_id": "sleep", "kind": "bedtime", "value": late, "nights": n, "bedtime": planned}


def build_brief(days: list[dict], settings: Settings, today: str) -> dict:
    dates = last_n_dates(today, 7)
    by_date = {d["date"]: d for d in days if d["date"] in dates}
    window = [by_date.get(k, {}) for k in dates]

    rows = []  # (area, value, target, mode)
    for area_id in settings.modules:
        area = AREAS_BY_ID[area_id]
        value = area_value(area, window)
        if value is None:
            continue
        t = target_for(settings, area_id)
        rows.append((area, round_value(area, value), t.target, t.mode))

    if not rows:
        return {"sentences": [FIRST_BRIEF], "facts": []}

    facts = [{"area_id": a.id, "value": v, "target": t, "mode": m} for a, v, t, m in rows]
    area, value, target, mode = max(rows, key=lambda r: _behind_by(r[1], r[2], r[3]))

    if _behind_by(value, target, mode) > 0:
        first = f"{area.label} is furthest behind: {_describe(area, value, target)}."
    else:
        first = (f"Everything is on track; {area.label} is closest to its target "
                 f"at {_describe(area, value, target)}.")

    bedtime = None
    if settings.sleep_schedule is not None and "sleep" in settings.modules:
        bedtime = bedtime_line(window, settings.sleep_schedule.bedtime)

    points = [(k, d.get(area.field)) for k, d in zip(dates, window) if d.get(area.field) is not None]
    if bedtime and area.id == "sleep":
        # Sleep is the focus: the bedtime line is the pattern.
        second, fact = bedtime
        facts.append(fact)
        bedtime = None
    elif len(points) >= MIN_PATTERN_POINTS:
        pick = min if mode == "up" else max
        key, worst = pick(points, key=lambda p: p[1])
        worst = round_value(area, worst)
        word = "Lowest" if mode == "up" else "Highest"
        weekday = WEEKDAYS[date.fromisoformat(key).weekday()]
        second = f"{word} was {weekday} ({_amount(area, worst)})."
        facts.append({"area_id": area.id, "value": worst, "target": target, "mode": mode, "date": key})
    else:
        second = f"Log {area.label} on more days to see a pattern."

    sentences = [first, second, area.suggestion]
    sleep = next((r for r in rows if r[0].id == "sleep"), None)
    low_sleep = sleep is not None and sleep[1] < LOW_SLEEP_HOURS
    # At most 4 sentences: the low-sleep warning wins over the bedtime line.
    if bedtime and len(sentences) + 1 + low_sleep <= MAX_SENTENCES:
        sentences.append(bedtime[0])
        facts.append(bedtime[1])
    if low_sleep:
        sentences.append(LOW_SLEEP_LINE)
    return {"sentences": sentences, "facts": facts}

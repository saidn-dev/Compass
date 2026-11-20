"""The daily brief: 3-4 plain sentences built from your last 7 days.

The area furthest from its target with its number, one pattern, one action of 30 minutes or
less. The tone setting decides the wording: "supportive" says what happened, offers the
action and adds a gentle limit; "direct" says the same facts shorter. Neither shames. Also returns the numbers it used. With a sleep schedule, one more line says
how often you got to bed on time. With dated study goals, one more line says how
far away the nearest one is.
"""
from datetime import date

from app.areas import Area, area_value, effective_target, last_n_dates
from app.models import Settings
from app.settings_rules import AREAS_BY_ID, target_for
from app.sleep import LATE_GRACE_MINUTES, minutes_late
from app.study import study_line
from app.work import work_tip

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
    return round(value, 1)


def _fmt(value: float) -> str:
    return str(int(value)) if value == int(value) else str(value)


def _amount(area: Area, value: float) -> str:
    return f"{_fmt(value)} {area.unit}"


def _describe(area: Area, value: float, target: float) -> str:
    period = "average" if area.aggregate == "avg" else "this week"
    return f"{_amount(area, value)} {period} against {_amount(area, target)}"


# The gentle limit after a supportive offer: how much is enough.
GENTLE_LIMITS = {
    "sleep": "even 15 minutes earlier helps",
    "up": "there's no need to make up the whole week today",
    "limit": "stopping on time matters more than finishing the list",
}


def offer(tip: str, area_id: str, mode: str, tone: str) -> str:
    """The tip as an offer with a gentle limit (supportive), or as it is (direct).

    "Do one 30-minute study block." -> "If it feels right, do one 30-minute study block,
    but there's no need to make up the whole week today."
    """
    if tone == "direct":
        return tip
    limit = GENTLE_LIMITS["sleep" if area_id == "sleep" else mode]
    return f"If it feels right, {tip[0].lower()}{tip[1:].rstrip('.')}, but {limit}."


def first_sentence(area: Area, value: float, target: float, mode: str, tone: str) -> str:
    """What happened: the area furthest from its target, with its numbers. Never "behind"."""
    gap = round(abs(target - value), 1)
    if _behind_by(value, target, mode) <= 0:
        if tone == "direct":
            return f"Everything is on course. Closest to its target: {area.label}, {_describe(area, value, target)}."
        return (f"Everything is on course; {area.label} is closest to its target "
                f"at {_describe(area, value, target)}.")
    if tone == "direct":
        word = "short" if mode == "up" else "over"
        return f"{area.label}: {_describe(area, value, target)}, {_amount(area, gap)} {word}."
    where = "furthest from its target" if mode == "up" else "furthest over its limit"
    return f"{area.label} is {where}: {_describe(area, value, target)}."


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
        target = effective_target(area, t.target, window)
        if target <= 0:
            continue  # a whole week of rest asks for nothing
        rows.append((area, round_value(area, value), target, t.mode))

    if not rows:
        return {"sentences": [FIRST_BRIEF], "facts": []}

    facts = [{"area_id": a.id, "value": v, "target": t, "mode": m} for a, v, t, m in rows]
    area, value, target, mode = max(rows, key=lambda r: _behind_by(r[1], r[2], r[3]))

    first = first_sentence(area, value, target, mode, settings.tone)

    bedtime = None
    if settings.sleep_schedule is not None and "sleep" in settings.modules:
        bedtime = bedtime_line(window, settings.sleep_schedule.bedtime)
    study = study_line(settings.study_goals, today) if "study" in settings.modules else None

    points = [(k, d.get(area.field)) for k, d in zip(dates, window) if d.get(area.field) is not None]
    if bedtime and area.id == "sleep":
        # Sleep is the focus: the bedtime line is the pattern.
        second, fact = bedtime
        facts.append(fact)
        bedtime = None
    elif study and area.id == "study":
        # Study is the focus: the nearest goal is the pattern.
        second, fact, _ = study
        facts.append(fact)
        study = None
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

    tip = work_tip(settings.work, mode) if area.id == "work" else area.suggestion
    sentences = [first, second, offer(tip, area.id, mode, settings.tone)]
    sleep = next((r for r in rows if r[0].id == "sleep"), None)
    low_sleep = sleep is not None and sleep[1] < LOW_SLEEP_HOURS

    # At most 4 sentences. Lines that don't fit are left out, in this order of
    # importance: low-sleep warning, upcoming study date, bedtime, passed study date.
    upcoming = study if study and study[2] else None
    passed = study if study and not study[2] else None
    extras = [(LOW_SLEEP_LINE, None)] if low_sleep else []
    extras += [(line[0], line[1]) for line in (upcoming, bedtime, passed) if line]
    chosen = extras[:MAX_SENTENCES - len(sentences)]
    # The warning always goes last.
    for text, fact in sorted(chosen, key=lambda e: e[0] == LOW_SLEEP_LINE):
        sentences.append(text)
        if fact:
            facts.append(fact)
    return {"sentences": sentences, "facts": facts}

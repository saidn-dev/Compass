"""Looking back: patterns, streaks, the weekly review, 12 weeks of history.

Also two small helpers for today: yesterday's unfinished tasks and tonight's bedtime.
Everything is worked out from the days you logged; "today" always comes from the caller.
"""
from datetime import date, timedelta

from app.areas import Area, area_score, area_value, effective_target, last_n_dates, score_words
from app.brief import WEEKDAYS, _fmt, round_value
from app.lists import habit_completion
from app.models import MAX_TASKS, TAGS, Settings
from app.pages import PERIODS
from app.settings_rules import AREAS_BY_ID, target_for
from app.sleep import LATE_GRACE_MINUTES, minutes_late, time_minus_hours
from app.work import work_tip

PATTERN_DAYS = 28          # patterns look at the last 4 weeks
MIN_PATTERN_DAYS = 3       # days needed on each side of a comparison
MIN_PATTERN_DIFFERENCE = 0.15
MAX_PATTERNS = 5
HISTORY_WEEKS = 12
GUIDANCE_NIGHTS = 3
GUIDANCE_MIN_MINUTES = 30
GUIDANCE_MAX_MINUTES = 60

VERBS = {"sleep": "slept", "study": "studied", "work": "worked"}


def _short_date(date_key: str) -> str:
    """"2026-11-07" -> "7 Nov"."""
    d = date.fromisoformat(date_key)
    return f"{d.day} {d.strftime('%b')}"


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


# --- patterns ---

def _compare(days: list[dict], in_group, field: str) -> tuple[float, float, int, int] | None:
    """Average of field on days in the group and on the other days, or None if too few days."""
    inside = [d[field] for d in days if in_group(d) is True and d.get(field) is not None]
    outside = [d[field] for d in days if in_group(d) is False and d.get(field) is not None]
    if len(inside) < MIN_PATTERN_DAYS or len(outside) < MIN_PATTERN_DAYS:
        return None
    a, b = round(_mean(inside), 1), round(_mean(outside), 1)
    if max(a, b) <= 0 or abs(a - b) / max(a, b) < MIN_PATTERN_DIFFERENCE:
        return None
    return a, b, len(inside), len(outside)


def find_patterns(days: list[dict], settings: Settings, today: str) -> list[dict]:
    """Sentences like "On days after 7.5+ h of sleep you studied 3 h on average, against 1 h on other days."

    Compares days in a group (slept enough, or carrying a tag) with the other days of the
    last 4 weeks. Needs 3 days on each side and a difference of 15% or more.
    """
    window = set(last_n_dates(today, PATTERN_DAYS))
    recent = [d for d in days if d["date"] in window]
    modules = settings.modules

    groups = []  # (how the sentence starts, the test for a day, the area the group is about)
    if "sleep" in modules:
        enough = target_for(settings, "sleep").target

        def slept_enough(d, enough=enough):
            return None if d.get("sleep_hours") is None else d["sleep_hours"] >= enough

        groups.append((f"On days after {_fmt(enough)}+ h of sleep", slept_enough, "sleep"))
    for tag, label in TAGS.items():
        groups.append((f"On days tagged {label}", lambda d, tag=tag: tag in d.get("tags", []), None))

    found = []
    for start, in_group, about in groups:
        for area_id in modules:
            if area_id == about:
                continue
            area = AREAS_BY_ID[area_id]
            result = _compare(recent, in_group, area.field)
            if result:
                a, b, n_a, n_b = result
                text = (f"{start} you {VERBS[area_id]} {_fmt(a)} {area.unit} on average, "
                        f"against {_fmt(b)} {area.unit} on other days.")
                found.append((abs(a - b) / max(a, b), text, n_a, n_b))
        result = _compare(recent, in_group, "mood")
        if result:
            a, b, n_a, n_b = result
            text = f"{start} your mood averaged {_fmt(a)} out of 5, against {_fmt(b)} on other days."
            found.append((abs(a - b) / max(a, b), text, n_a, n_b))

    found.sort(key=lambda p: -p[0])
    return [
        {"text": text, "detail": f"{n_a} days against {n_b}, from the last 4 weeks."}
        for _, text, n_a, n_b in found[:MAX_PATTERNS]
    ]


# --- streaks ---

def _streak(label: str, flags: list[bool]) -> dict:
    """flags: one per day, newest first. Today not done yet doesn't break a streak."""
    counted = flags[1:] if flags and not flags[0] else flags
    current = 0
    for done in counted:
        if not done:
            break
        current += 1
    best = run = 0
    for done in flags:
        run = run + 1 if done else 0
        best = max(best, run)
    if current == 0:
        text = "No streak yet"
    else:
        text = f"{current} day{'' if current == 1 else 's'} running"
    return {"label": label, "days": current, "best": best, "text": text}


def find_streaks(days: list[dict], settings: Settings, today: str) -> list[dict]:
    """Days in a row: logging any module, in bed on time (with a schedule), each habit."""
    by_date = {d["date"]: d for d in days}
    if by_date:
        span = (date.fromisoformat(today) - date.fromisoformat(min(by_date))).days + 1
    else:
        span = 1
    newest_first = [by_date.get(k, {}) for k in reversed(last_n_dates(today, max(span, 1)))]

    fields = [AREAS_BY_ID[m].field for m in settings.modules]
    streaks = [_streak("Logging", [any(d.get(f) is not None for f in fields) for d in newest_first])]

    if settings.sleep_schedule is not None and "sleep" in settings.modules:
        planned = settings.sleep_schedule.bedtime
        on_time = [bool(d.get("bedtime")) and minutes_late(d["bedtime"], planned) <= LATE_GRACE_MINUTES
                   for d in newest_first]
        streaks.append(_streak("Bedtime on time", on_time))

    for habit in settings.habits:
        streaks.append(_streak(habit.name, [d.get("habits", {}).get(habit.id) is True for d in newest_first]))
    return streaks


# --- weekly review ---

def _week_numbers(area: Area, settings: Settings, window: list[dict]) -> tuple[float | None, int | None]:
    """An area's value and score for one week."""
    raw = area_value(area, window)
    if raw is None:
        return None, None
    value = round_value(area, raw)
    t = target_for(settings, area.id)
    return value, area_score(value, effective_target(area, t.target, window), t.mode)


def _overall(scores: list[int | None]) -> int | None:
    present = [s for s in scores if s is not None]
    return round(sum(present) / len(present)) if present else None


def _change(now: float, before: float | None, unit: str = "") -> str:
    """"up from 6 h", "down from 6 h", "same as the week before", or "" with nothing before."""
    if before is None:
        return ""
    if now == before:
        return "same as the week before"
    return f"{'up' if now > before else 'down'} from {_fmt(before)}{unit}"


def build_review(days: list[dict], settings: Settings, today: str) -> dict:
    """The last 7 days against the 7 before: each module, the overall score, and one thing to change."""
    dates = last_n_dates(today, 14)
    by_date = {d["date"]: d for d in days}
    before = [by_date.get(k, {"date": k}) for k in dates[:7]]
    week = [by_date.get(k, {"date": k}) for k in dates[7:]]

    modules = []
    for area_id in settings.modules:
        area = AREAS_BY_ID[area_id]
        value, score = _week_numbers(area, settings, week)
        previous, previous_score = _week_numbers(area, settings, before)

        if value is None:
            value_text, change_text = "Nothing logged", ""
        else:
            value_text = f"{_fmt(value)} {area.unit} {PERIODS[area.aggregate]}"
            change = _change(value, previous, f" {area.unit}")
            change_text = f"{change[0].upper()}{change[1:]}." if change else "Nothing logged the week before."

        best = None
        logged = [(d[area.field], d["date"]) for d in week if d.get(area.field) is not None]
        if len(logged) >= 2 and target_for(settings, area_id).mode == "up":
            top, top_date = max(logged)
            weekday = WEEKDAYS[date.fromisoformat(top_date).weekday()]
            best = f"Best day: {weekday} ({_fmt(round_value(area, top))} {area.unit})."

        modules.append({"id": area.id, "label": area.label, "value_text": value_text, "change_text": change_text,
                        "score": score, "score_label": score_words(score)[0],
                        "previous_score": previous_score, "best": best})

    overall = _overall([m["score"] for m in modules])
    overall_before = _overall([m["previous_score"] for m in modules])
    label, headline = score_words(overall)
    if overall is None or overall_before is None:
        score_text = ""
    elif overall == overall_before:
        score_text = "Same as the week before."
    else:
        word = "Up" if overall > overall_before else "Down"
        score_text = f"{word} {abs(overall - overall_before)} from the week before."

    extras = []
    habits = [h.model_dump() for h in settings.habits]
    done = habit_completion([d for d in week if "habits" in d], habits)
    if done is not None:
        done_before = habit_completion([d for d in before if "habits" in d], habits)
        change = _change(round(done), None if done_before is None else round(done_before), "%")
        extras.append(f"Habits: {round(done)}% done{', ' + change if change else ''}.")
    tasks = [t for d in week for t in d.get("tasks", [])]
    if tasks:
        extras.append(f"Focus tasks: {sum(t['done'] for t in tasks)} of {len(tasks)} done.")
    moods = [d["mood"] for d in week if d.get("mood") is not None]
    if moods:
        moods_before = [d["mood"] for d in before if d.get("mood") is not None]
        now = round(_mean(moods), 1)
        change = _change(now, round(_mean(moods_before), 1) if moods_before else None)
        extras.append(f"Mood: {_fmt(now)} out of 5 on average{', ' + change if change else ''}.")

    scored = [m for m in modules if m["score"] is not None]
    if not scored:
        change_line = None
    else:
        weakest = min(scored, key=lambda m: m["score"])
        if weakest["score"] >= 100:
            change_line = "Keep doing what you're doing."
        else:
            area = AREAS_BY_ID[weakest["id"]]
            mode = target_for(settings, area.id).mode
            tip = work_tip(settings.work, mode) if area.id == "work" else area.suggestion
            change_line = f"One thing to change: {tip}"

    return {
        "range": f"{_short_date(dates[7])} to {_short_date(dates[-1])}",
        "score": {"value": overall, "previous": overall_before, "label": label, "headline": headline,
                  "text": score_text},
        "modules": modules,
        "extras": extras,
        "change": change_line,
    }


def build_insights(days: list[dict], settings: Settings, today: str) -> dict:
    return {
        "date": today,
        "review": build_review(days, settings, today),
        "patterns": find_patterns(days, settings, today),
        "streaks": find_streaks(days, settings, today),
    }


# --- history ---

def build_history(area: Area, by_date: dict[str, dict], today: str) -> list[dict]:
    """The area's value for each of the last 12 weeks, oldest first. Each week ends on today's weekday."""
    dates = last_n_dates(today, HISTORY_WEEKS * 7)
    weeks = []
    for start in range(0, len(dates), 7):
        chunk = dates[start:start + 7]
        raw = area_value(area, [by_date.get(k, {}) for k in chunk])
        weeks.append({"label": _short_date(chunk[0]), "value": None if raw is None else round_value(area, raw)})
    return weeks


# --- today ---

def carry_over(by_date: dict[str, dict], today: str) -> list[str]:
    """Yesterday's unfinished focus tasks that aren't planned today, while today has room."""
    yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    planned = [t["text"] for t in by_date.get(today, {}).get("tasks", [])]
    room = MAX_TASKS - len(planned)
    if room <= 0:
        return []
    undone = [t["text"] for t in by_date.get(yesterday, {}).get("tasks", []) if not t["done"]]
    return [text for text in undone if text not in planned][:room]


def bedtime_guidance(settings: Settings, window: list[dict]) -> str | None:
    """Tonight's bedtime for someone with a sleep schedule.

    The planned bedtime, moved earlier (by 15 minutes at a time, an hour at most) when the
    last 3 logged nights fell short of the sleep target by half an hour or more.
    """
    schedule = settings.sleep_schedule
    if schedule is None:
        return None
    nights = [d["sleep_hours"] for d in sorted(window, key=lambda d: d["date"], reverse=True)
              if d.get("sleep_hours") is not None][:GUIDANCE_NIGHTS]
    if nights:
        short = (target_for(settings, "sleep").target - _mean(nights)) * 60
        if short >= GUIDANCE_MIN_MINUTES:
            earlier = min(GUIDANCE_MAX_MINUTES, round(short / 15) * 15)
            bedtime = time_minus_hours(schedule.bedtime, earlier / 60)
            count = f"{len(nights)} night{'' if len(nights) == 1 else 's'}"
            return (f"Tonight: aim to be in bed by {bedtime}. "
                    f"You're about {round(short / 15) * 15} minutes a night short over your last {count}.")
    return f"Tonight: aim to be in bed by {schedule.bedtime}."

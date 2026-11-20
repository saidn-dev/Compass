"""Everything the dashboard shows for one day: brief, area cards, habit grid.

The Study card also carries the nearest study goal, and the Work card its role and goal line.
For the module pages it also returns the 7 dates, and each area's period words and details lines.
Each area has a 0-100 score with its words (bands for a target, Great / Ok / Too much for a limit),
its contributors and the top reason (the weakest contributor). The top-level score is their average,
and its reason names the weakest area.
Rest days lower a weekly target. `days` may hold up to 12 weeks: the extra days feed each area's history.

Recomputed on every request, so it is live as you log.
"""
from app.areas import (
    TOP_LEVELS, area_progress, area_score, area_value, effective_target, last_n_dates, score_words, trend,
)
from app.baseline import learning_day, learning_text, usual
from app.brief import build_brief, round_value
from app.focus import focus_summary
from app.insights import bedtime_guidance, build_history, carry_over
from app.lists import habit_completion, is_logged
from app.models import TAGS, Settings, normalize_day
from app.pages import PERIODS, module_contributors, module_details, top_reason
from app.settings_rules import AREAS_BY_ID, target_for
from app.study import card_goal
from app.work import work_card

def _maybe_round(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def _overall_reason(areas: list[dict]) -> str | None:
    """"Mostly Study: 4 of 10 h this week": the lowest-scoring area below the top level, or None."""
    below = [a for a in areas if a["score"] is not None and a["score_label"] not in TOP_LEVELS]
    if not below:
        return None
    weakest = min(below, key=lambda a: a["score"])
    return f"Mostly {weakest['label']}: {weakest['contributors'][0]['text']}"


def build_dashboard(days: list[dict], settings: Settings, today: str) -> dict:
    dates = last_n_dates(today, 7)
    by_date = {d["date"]: d for d in days}
    window = [by_date.get(k) or normalize_day({}, k) for k in dates]
    # The first 14 days after the first log: learning your rhythm, no usual range yet.
    learning = learning_day(days, today)

    areas = []
    for area_id in settings.modules:
        area = AREAS_BY_ID[area_id]
        t = target_for(settings, area_id)
        raw = area_value(area, window)
        value = None if raw is None else round_value(area, raw)
        series = [d[area.field] for d in window]
        target = effective_target(area, t.target, window)
        score = area_score(value, target, t.mode)
        label, headline = score_words(score, t.mode)
        contributors = module_contributors(area.id, settings, window)
        entry = {
            "id": area.id,
            "label": area.label,
            "unit": area.unit,
            "value": value,
            "target": target,
            "mode": t.mode,
            "progress": _maybe_round(area_progress(value, target, t.mode)),
            "trend": trend(series),
            "series": series,
            "period": PERIODS[area.aggregate],
            "details": module_details(area.id, settings, window, today, days),
            "score": score,
            "score_label": label,
            "headline": headline,
            "contributors": contributors,
            "reason": top_reason(contributors),
            # For the week's bars: where one day's share of the target sits.
            "daily_target": t.target if area.aggregate == "avg" else round(t.target / len(dates), 2),
            "rest_days": sum(d["rest"] for d in window) if area.aggregate == "sum" else 0,
            # The last 12 weeks, with the target a full week is measured against.
            "history": build_history(area, by_date, today),
            "weekly_target": t.target,
            # Your last 14 days against your usual range, after the learning period.
            "usual": None if learning else usual(area, by_date, today),
            "learning": learning_text(learning) if learning else None,
        }
        if learning and value is not None:
            entry["headline"] = "Learning your rhythm"
        if area.id == "sleep":
            guidance = bedtime_guidance(settings, window)
            if guidance:
                entry["guidance"] = guidance
        if area.id == "study":
            entry["goal"] = card_goal(settings.study_goals, today)
        if area.id == "work":
            entry["goal"] = work_card(settings.work)
        areas.append(entry)

    scores = [a["score"] for a in areas if a["score"] is not None]
    overall = round(sum(scores) / len(scores)) if scores else None
    overall_label, overall_headline = score_words(overall)
    overall_reason = _overall_reason(areas)

    habits = [h.model_dump() for h in settings.habits]
    grid = [
        {
            "id": h["id"],
            "name": h["name"],
            "days": [
                {"date": d["date"], "done": (d["habits"].get(h["id"]) is True) if is_logged(d) else None}
                for d in window
            ],
        }
        for h in habits
    ]
    return {
        "date": today,
        "dates": dates,
        "score": {"value": overall, "label": overall_label, "headline": overall_headline,
                  "reason": overall_reason},
        "learning": None if learning is None else {"day": learning, "text": learning_text(learning)},
        "brief": build_brief(window, settings, today),
        "areas": areas,
        "carry_over": carry_over(by_date, today),
        "focus": focus_summary(window, today),
        "tags": [{"id": tag, "label": label} for tag, label in TAGS.items()],
        "habits": {"grid": grid, "completion": _maybe_round(habit_completion(window, habits))},
    }

"""Everything the dashboard shows for one day: brief, area cards, habit grid.

Recomputed on every request, so it is live as you log.
"""
from app.areas import area_progress, area_status, area_value, last_n_dates, trend
from app.brief import build_brief, round_value
from app.lists import habit_completion, is_logged
from app.models import Settings, normalize_day
from app.settings_rules import AREAS_BY_ID, target_for

STATUS_WORDS = {"on_track": "On track", "behind": "Behind", "no_data": "No data"}


def _maybe_round(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def build_dashboard(days: list[dict], settings: Settings, today: str) -> dict:
    dates = last_n_dates(today, 7)
    by_date = {d["date"]: d for d in days}
    window = [by_date.get(k) or normalize_day({}, k) for k in dates]

    areas = []
    for area_id in settings.modules:
        area = AREAS_BY_ID[area_id]
        t = target_for(settings, area_id)
        raw = area_value(area, window)
        value = None if raw is None else round_value(area, raw)
        series = [d[area.field] for d in window]
        areas.append({
            "id": area.id,
            "label": area.label,
            "unit": area.unit,
            "value": value,
            "target": t.target,
            "mode": t.mode,
            "status": STATUS_WORDS[area_status(value, t.target, t.mode)],
            "progress": _maybe_round(area_progress(value, t.target, t.mode)),
            "trend": trend(series),
            "series": series,
        })

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
        "brief": build_brief(window, settings, today),
        "areas": areas,
        "habits": {"grid": grid, "completion": _maybe_round(habit_completion(window, habits))},
    }

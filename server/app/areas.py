"""Life areas (sleep, steps, study, work, spending, fasting) and their rules.

Date helpers, 7-day averages/sums, "On track / Behind / No data" status,
progress percent and trend direction. A gap (None) is never treated as 0.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Aggregate = Literal["avg", "sum", "latest"]
Mode = Literal["up", "limit"]
Status = Literal["on_track", "behind", "no_data"]
Trend = Literal["up", "down", "flat", "none"]

TREND_THRESHOLD = 0.05


@dataclass(frozen=True)
class Area:
    id: str
    label: str
    unit: str
    field: str
    aggregate: Aggregate
    default_target: float
    default_mode: Mode
    suggestion: str


AREAS: list[Area] = [
    Area("sleep", "Sleep", "h", "sleep_hours", "avg", 7.5, "up",
         "Set a wind-down alarm 30 minutes before bed tonight."),
    Area("steps", "Movement", "steps", "steps", "avg", 8000, "up",
         "Take a 20-minute walk today."),
    Area("study", "Study", "h", "study_hours", "sum", 12, "up",
         "Do one 30-minute study block on your nearest deadline."),
    Area("work", "Work", "h", "work_hours", "sum", 16, "up",
         "Block 30 minutes for your most urgent paid task."),
    Area("spending", "Spending", "%", "spend_pct_of_budget", "latest", 100, "limit",
         "Spend 10 minutes listing what you can skip buying this week."),
    Area("fasting", "Fasting", "h", "fasting_hours", "avg", 16, "up",
         "Pick tonight's last-meal time and set a reminder."),
]


def date_key(d: date) -> str:
    return d.isoformat()


def last_n_dates(end_key: str, n: int) -> list[str]:
    """The n date keys ending on end_key, oldest first."""
    end = date.fromisoformat(end_key)
    return [date_key(end - timedelta(days=i)) for i in range(n - 1, -1, -1)]


def area_value(area: Area, days: list[dict]) -> float | None:
    """The area's 7-day value. Days are oldest first; missing fields are gaps."""
    values = [d.get(area.field) for d in days]
    present = [v for v in values if v is not None]
    if not present:
        return None
    if area.aggregate == "avg":
        return sum(present) / len(present)
    if area.aggregate == "sum":
        return sum(present)
    return present[-1]


def area_status(value: float | None, target: float, mode: str) -> Status:
    if mode not in ("up", "limit"):
        raise ValueError(f"unknown mode: {mode}")
    if value is None:
        return "no_data"
    on_track = value >= target if mode == "up" else value <= target
    return "on_track" if on_track else "behind"


def area_progress(value: float | None, target: float, mode: str) -> float | None:
    """Percent of target (for "limit", percent of the limit used), clamped 0-200."""
    if value is None or target <= 0:
        return None
    return max(0.0, min(200.0, value / target * 100))


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return sum(present) / len(present) if present else None


def trend(series: list[float | None]) -> Trend:
    """Compare the later half of the series with the earlier half."""
    if sum(v is not None for v in series) < 2:
        return "none"
    middle = len(series) // 2
    earlier, later = _mean(series[:middle]), _mean(series[middle:])
    if earlier is None or later is None:
        return "none"
    if earlier == 0:
        return "up" if later > 0 else "flat"
    change = (later - earlier) / abs(earlier)
    if change > TREND_THRESHOLD:
        return "up"
    if change < -TREND_THRESHOLD:
        return "down"
    return "flat"

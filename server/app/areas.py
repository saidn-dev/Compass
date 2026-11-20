"""Life areas (sleep, study, work) and their rules.

Date helpers, 7-day averages/sums, scores and their words (bands for targets,
Great / Ok / Too much for limits), progress percent and trend direction.
A gap (None) is never treated as 0.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Aggregate = Literal["avg", "sum"]
Mode = Literal["up", "limit"]
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
    max_target: float | None = None  # the highest target that makes sense (a day or a week of hours)


AREAS: list[Area] = [
    Area("sleep", "Sleep", "h", "sleep_hours", "avg", 7.5, "up",
         "Set a wind-down alarm 30 minutes before bed tonight.", 24),
    Area("study", "Study", "h", "study_hours", "sum", 12, "up",
         "Do one 30-minute study block on your nearest deadline.", 168),
    Area("work", "Work", "h", "work_hours", "sum", 16, "up",
         "Block 30 minutes today for your most urgent task.", 168),
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
    return sum(present)


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


def effective_target(area: Area, target: float, days: list[dict]) -> float:
    """The target after rest days. A weekly total asks for less: 2 rest days in 7 leave 5/7
    of it. A nightly average is left alone, since sleep still counts on a rest day."""
    if area.aggregate != "sum" or not days:
        return target
    resting = sum(d.get("rest") is True for d in days)
    return round(target * (len(days) - resting) / len(days), 1)


# A score's words: the label shown beside it and the headline over it.
# The first row whose minimum the score reaches is used.
SCORE_BANDS = [
    (85, "Optimal", "Right on course"),
    (70, "Good", "Close to course"),
    (60, "Fair", "Drifting a little"),
    (0, "Pay attention", "Off course"),
]
# A limit (stay under it) has its own words: at or under is Great, up to 15% over is Ok.
LIMIT_BANDS = [
    (100, "Great", "Within your limit"),
    (85, "Ok", "A little over"),
    (0, "Too much", "Well over your limit"),
]
NO_SCORE_WORDS = ("No data", "No bearings yet")
TOP_LEVELS = (SCORE_BANDS[0][1], LIMIT_BANDS[0][1])


def area_score(value: float | None, target: float, mode: str) -> int | None:
    """How close the value is to its target, 0 to 100. A gap has no score.

    "up": the percent of the target reached, capped at 100.
    "limit": 100 at or under the limit, then one point lost for each percent over.
    """
    if value is None or target <= 0:
        return None
    if mode == "up":
        return round(min(100.0, value / target * 100))
    over = (value - target) / target * 100
    return round(max(0.0, min(100.0, 100 - over)))


def score_words(score: int | None, mode: str = "up") -> tuple[str, str]:
    """(label, headline) for a score, e.g. ("Good", "Close to course"); a limit gets ("Ok", "A little over")."""
    if score is None:
        return NO_SCORE_WORDS
    bands = LIMIT_BANDS if mode == "limit" else SCORE_BANDS
    for minimum, label, headline in bands:
        if score >= minimum:
            return label, headline
    return bands[-1][1:]

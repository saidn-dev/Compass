"""Data shapes (Day, Target, Goal, Settings) and input cleaning.

normalize_day turns messy input into a clean Day: blank or junk numbers become
gaps (None), never 0; a real 0 is kept.
"""
import math
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

# Allowed range per numeric Day field. Anything outside becomes a gap.
NUMERIC_FIELDS: dict[str, tuple[float, float]] = {
    "sleep_hours": (0, 24),
    "steps": (0, 200_000),
    "study_hours": (0, 24),
    "work_hours": (0, 24),
    "spend_pct_of_budget": (0, 1000),
    "fasting_hours": (0, 24),
}
WHOLE_NUMBER_FIELDS = {"steps"}

MAX_TASKS = 3
MAX_TASK_TEXT = 200
MAX_NOTE = 5000


def _number(value: object, low: float, high: float) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            value = float(value)
        except ValueError:
            return None
    if not isinstance(value, (int, float)):
        return None
    if math.isnan(value) or math.isinf(value) or not low <= value <= high:
        return None
    return value


def _tasks(raw: object) -> list[dict]:
    if not isinstance(raw, list):
        return []
    tasks = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("text"), str):
            continue
        text = item["text"].strip()[:MAX_TASK_TEXT]
        if text:
            tasks.append({"text": text, "done": item.get("done") is True})
    return tasks[:MAX_TASKS]


def _habits(raw: object) -> dict[str, bool]:
    if not isinstance(raw, dict):
        return {}
    return {str(k): v for k, v in raw.items() if isinstance(v, bool)}


def normalize_day(raw: dict, date_key: str) -> dict:
    """A complete, clean Day for date_key. Raises ValueError on a bad date."""
    date.fromisoformat(date_key)
    day: dict = {"date": date_key}
    for field, (low, high) in NUMERIC_FIELDS.items():
        value = _number(raw.get(field), low, high)
        if value is not None and field in WHOLE_NUMBER_FIELDS:
            value = int(value)
        day[field] = value
    day["habits"] = _habits(raw.get("habits"))
    day["tasks"] = _tasks(raw.get("tasks"))
    note = raw.get("note")
    day["note"] = "" if note is None else str(note)[:MAX_NOTE]
    return day


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class Target(BaseModel):
    area_id: str
    target: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    mode: Literal["up", "limit"]


class Goal(BaseModel):
    name: Name
    percent: Annotated[float, Field(allow_inf_nan=False)] = 0
    detail: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""

    @field_validator("percent")
    @classmethod
    def _clamp(cls, v: float) -> float:
        return max(0.0, min(100.0, v))


class Habit(BaseModel):
    id: str
    name: Name


class Settings(BaseModel):
    onboarded: bool = False
    modules: Annotated[list[str], Field(max_length=5)] = []
    targets: list[Target] = []
    habits: list[Habit] = []
    goals: Annotated[list[Goal], Field(max_length=3)] = []
    theme: Literal["light", "dark", "system"] = "system"

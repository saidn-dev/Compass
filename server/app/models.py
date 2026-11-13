"""Data shapes (Day, Target, Goal, StudyGoal, Settings) and input cleaning.

normalize_day turns messy input into a clean Day: blank or junk numbers become
gaps (None), never 0; a real 0 is kept.
"""
import math
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

from app.sleep import hours_between, parse_time

# Allowed range per numeric Day field. Anything outside becomes a gap.
NUMERIC_FIELDS: dict[str, tuple[float, float]] = {
    "sleep_hours": (0, 24),
    "study_hours": (0, 24),
    "work_hours": (0, 24),
}

# The day's check-in tags, in the order they are shown. id -> label.
TAGS: dict[str, str] = {
    "caffeine": "Caffeine late",
    "alcohol": "Alcohol",
    "exercise": "Exercise",
    "exam": "Exam or deadline",
    "sick": "Sick",
    "travel": "Travel",
    "screens": "Screens late",
    "social": "Social evening",
}
MOOD_RANGE = (1, 5)

MAX_TASKS = 3
MAX_TASK_TEXT = 200
MAX_NOTE = 5000
MAX_STUDY_GOALS = 5


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


def _tags(raw: object) -> list[str]:
    """Known tags only, each once, in the order of TAGS."""
    if not isinstance(raw, list):
        return []
    return [tag for tag in TAGS if tag in raw]


def _mood(raw: object) -> int | None:
    """A whole number from 1 to 5, or None."""
    number = _number(raw, *MOOD_RANGE)
    return int(number) if number is not None and number == int(number) else None


def check_date_key(date_key: str) -> str:
    """Return date_key if it is a real YYYY-MM-DD date, else raise ValueError."""
    try:
        if date.fromisoformat(date_key).isoformat() == date_key:
            return date_key
    except (TypeError, ValueError):
        pass
    raise ValueError(f"Dates must look like YYYY-MM-DD, got {date_key!r}.")


def merge_numbers(day: dict, raw: dict) -> dict:
    """Copy only the numeric fields found in raw onto day. Raises ValueError on a bad value."""
    fields = [f for f in NUMERIC_FIELDS if f in raw]
    if not fields:
        raise ValueError("No numeric values to save.")
    if "sleep_hours" in fields and day.get("bedtime") and day.get("wake_time"):
        raise ValueError("This day's sleep comes from its bed and wake times.")
    clean = normalize_day({f: raw[f] for f in fields}, day["date"])
    for f in fields:
        if clean[f] is None:
            raise ValueError(f"Bad value for {f}: {raw[f]!r}.")
    return {**day, **{f: clean[f] for f in fields}}


def normalize_day(raw: dict, date_key: str) -> dict:
    """A complete, clean Day for date_key. Raises ValueError on a bad date."""
    day: dict = {"date": check_date_key(date_key)}
    for field, (low, high) in NUMERIC_FIELDS.items():
        day[field] = _number(raw.get(field), low, high)
    # Bed and wake times: when both are there, they decide the hours slept.
    day["bedtime"] = parse_time(raw.get("bedtime"))
    day["wake_time"] = parse_time(raw.get("wake_time"))
    if day["bedtime"] and day["wake_time"]:
        day["sleep_hours"] = hours_between(day["bedtime"], day["wake_time"])
    day["habits"] = _habits(raw.get("habits"))
    day["tasks"] = _tasks(raw.get("tasks"))
    note = raw.get("note")
    day["note"] = "" if note is None else str(note)[:MAX_NOTE]
    # The check-in: tags, mood (1-5) and whether it is a rest day.
    day["tags"] = _tags(raw.get("tags"))
    day["mood"] = _mood(raw.get("mood"))
    day["rest"] = raw.get("rest") is True
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


class SleepSchedule(BaseModel):
    """A set bedtime and wake-up time, e.g. 22:30 and 06:30."""
    bedtime: str
    wake_time: str

    @field_validator("bedtime", "wake_time", mode="before")
    @classmethod
    def _time(cls, v: object) -> str:
        time = parse_time(v)
        if time is None:
            raise ValueError("Times must look like HH:MM, e.g. 22:30.")
        return time

    @model_validator(mode="after")
    def _different(self) -> "SleepSchedule":
        if self.bedtime == self.wake_time:
            raise ValueError("Bedtime and wake-up time must be different.")
        return self


class StudyGoal(BaseModel):
    """Something the user is studying for, e.g. "Data Structures exam", with an optional date."""
    name: Name
    date: str | None = None

    @field_validator("date", mode="before")
    @classmethod
    def _date(cls, v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            raise ValueError("Dates must look like YYYY-MM-DD.")
        return check_date_key(v.strip()) if v.strip() else None


WORK_KINDS = ("employed", "freelance", "student", "job_hunting", "other")
WORK_FOCUS = ("morning", "afternoon", "evening", "varies")
DERAILERS = ("priorities", "procrastination", "interruptions", "energy", "projects", "other")


class WorkSchedule(BaseModel):
    """The days and hours the user works, e.g. Monday to Friday, 09:00 to 17:00."""
    days: list[int]
    start: str
    end: str

    @field_validator("days")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("Pick at least one day.")
        if len(set(v)) != len(v):
            raise ValueError("Pick each day only once.")
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("Days are 0 (Monday) to 6 (Sunday).")
        return v

    @field_validator("start", "end", mode="before")
    @classmethod
    def _time(cls, v: object) -> str:
        time = parse_time(v)
        if time is None:
            raise ValueError("Times must look like HH:MM, e.g. 22:30.")
        return time

    @model_validator(mode="after")
    def _different(self) -> "WorkSchedule":
        if self.start == self.end:
            raise ValueError("Start and end can't be the same.")
        return self


class WorkProfile(BaseModel):
    """What the user told us about their work."""
    kind: Literal[*WORK_KINDS] | None = None
    role: Name | None = None
    schedule: WorkSchedule | None = None
    hours_vary: bool = False
    focus: Literal[*WORK_FOCUS] | None = None
    goal: Name | None = None
    derailers: list[Literal[*DERAILERS]] = []

    @field_validator("role", "goal", mode="before")
    @classmethod
    def _blank_text(cls, v: object) -> object:
        if isinstance(v, str) and not v.strip():
            return None
        return v

    @field_validator("derailers")
    @classmethod
    def _derailers(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("Pick each one only once.")
        return sorted(v, key=DERAILERS.index)

    @model_validator(mode="after")
    def _vary_or_schedule(self) -> "WorkProfile":
        if self.hours_vary and self.schedule is not None:
            raise ValueError("Hours that vary can't also have a set schedule.")
        return self


class Settings(BaseModel):
    onboarded: bool = False
    modules: Annotated[list[str], Field(max_length=3)] = []
    targets: list[Target] = []
    habits: list[Habit] = []
    goals: Annotated[list[Goal], Field(max_length=3)] = []
    theme: Literal["light", "dark", "system"] = "system"
    sleep_schedule: SleepSchedule | None = None
    study_goals: Annotated[list[StudyGoal], Field(max_length=MAX_STUDY_GOALS)] = []
    work: WorkProfile = WorkProfile()

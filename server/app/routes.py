"""The API: URLs under /api that the web page and the Java importer call.

Thin glue only. It calls the rule files and the database and returns JSON.
"""
import json
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, Header, Query, Request
from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.areas import AREAS, last_n_dates
from app.dashboard import build_dashboard
from app.focus import YEAR_DAYS, add_session, edit_session, focus_page, remove_session, with_focus_hours
from app.insights import HISTORY_WEEKS, build_insights
from app.db import Repository
from app.models import MAX_SESSION_NOTE, MAX_TASK_TEXT, SESSION_AREAS, SESSION_MINUTES, Settings, check_date_key, merge_numbers
from app.settings_rules import apply_onboarding, check_settings
from app.sleep import Age, HabitId, Role, parse_time, suggest

MAX_IMPORT_BYTES = 2 * 1024 * 1024
CONFIRM_DELETE = "delete-all"


class ApiError(Exception):
    """An error with its own status and code, sent in the standard error shape."""

    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


class Onboarding(BaseModel):
    modules: list[str]


class Bulk(BaseModel):
    days: list[Any]


class NewSession(BaseModel):
    """A focus session the timer just finished. The server makes its id."""
    area: Literal[*SESSION_AREAS]
    task: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_TASK_TEXT)] | None = None
    minutes: Annotated[int, Field(ge=SESSION_MINUTES[0], le=SESSION_MINUTES[1])]
    ended_at: str
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_SESSION_NOTE)] | None = None

    @field_validator("ended_at", mode="before")
    @classmethod
    def _time(cls, v: object) -> str:
        time = parse_time(v)
        if time is None:
            raise ValueError("Times must look like HH:MM, e.g. 14:05.")
        return time


class SessionChange(BaseModel):
    """A change to a saved session from the Focus record: its length, end time, task or note."""
    minutes: Annotated[int, Field(ge=SESSION_MINUTES[0], le=SESSION_MINUTES[1])] | None = None
    ended_at: str | None = None
    task: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_TASK_TEXT)] | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_SESSION_NOTE)] | None = None

    @field_validator("ended_at", mode="before")
    @classmethod
    def _time(cls, v: object) -> str | None:
        if v is None:
            return None
        time = parse_time(v)
        if time is None:
            raise ValueError("Times must look like HH:MM, e.g. 14:05.")
        return time


class SleepAnswers(BaseModel):
    """The "Let's work it out" answers. Every one can be skipped."""
    age: Age | None = None
    role: Role | None = None
    habits: list[HabitId] = []
    wake_time: str | None = None


def get_repo(request: Request) -> Repository:
    return request.app.state.repo


Repo = Annotated[Repository, Depends(get_repo)]
router = APIRouter(prefix="/api")


# --- modules ---

@router.get("/areas")
def list_areas() -> list[dict]:
    """Every module the page can offer, with its default target."""
    return [
        {"id": a.id, "label": a.label, "unit": a.unit,
         "default_target": a.default_target, "default_mode": a.default_mode}
        for a in AREAS
    ]


# --- settings ---

@router.get("/settings")
def read_settings(repo: Repo) -> Settings:
    return repo.get_settings()


@router.put("/settings")
def replace_settings(settings: Settings, repo: Repo) -> Settings:
    repo.put_settings(check_settings(settings))
    return repo.get_settings()


@router.post("/onboarding")
def onboarding(body: Onboarding, repo: Repo) -> Settings:
    repo.put_settings(apply_onboarding(repo.get_settings(), body.modules))
    return repo.get_settings()


# --- sleep ---

@router.post("/sleep/suggestion")
def sleep_suggestion(body: SleepAnswers) -> dict:
    """A suggested sleep goal or schedule. Nothing is saved."""
    return suggest(body.age, body.role, body.habits, body.wake_time)


# --- days ---

@router.get("/days/{date_key}")
def read_day(date_key: str, repo: Repo) -> dict:
    return repo.get_day(check_date_key(date_key))


@router.put("/days/{date_key}")
def save_day(date_key: str, body: Annotated[dict, Body()], repo: Repo) -> dict:
    check_date_key(date_key)
    # Sessions change only through their own URLs below, so a page holding an old
    # copy of the day (sent back to save a note, say) can't wipe a new session.
    stored = repo.get_day(date_key)
    repo.put_day({**body, "date": date_key, "sessions": stored["sessions"]})
    return repo.get_day(date_key)


@router.post("/days/{date_key}/sessions")
def save_focus_session(date_key: str, body: NewSession, repo: Repo) -> dict:
    day = repo.get_day(check_date_key(date_key))
    repo.put_day(add_session(day, body.model_dump()))
    return repo.get_day(date_key)


@router.delete("/days/{date_key}/sessions/{session_id}")
def remove_focus_session(date_key: str, session_id: str, repo: Repo) -> dict:
    day = repo.get_day(check_date_key(date_key))
    try:
        repo.put_day(remove_session(day, session_id))
    except LookupError:
        raise ApiError(404, "not_found", "There's no such focus session on that day.") from None
    return repo.get_day(date_key)


@router.patch("/days/{date_key}/sessions/{session_id}")
def change_focus_session(date_key: str, session_id: str, body: SessionChange, repo: Repo) -> dict:
    day = repo.get_day(check_date_key(date_key))
    # Only the fields sent change; "task": "" or "note": "" clears it.
    changes = body.model_dump(exclude_unset=True)
    for field in ("task", "note"):
        if field in changes and not changes[field]:
            changes[field] = None
    try:
        repo.put_day(edit_session(day, session_id, changes))
    except LookupError:
        raise ApiError(404, "not_found", "There's no such focus session on that day.") from None
    return repo.get_day(date_key)


@router.post("/days/bulk")
def save_days_bulk(body: Bulk, repo: Repo) -> dict:
    saved, skipped = 0, []
    for entry in body.days:
        date_key = entry.get("date") if isinstance(entry, dict) else None
        try:
            if not isinstance(entry, dict):
                raise ValueError("Each entry must be an object.")
            day = merge_numbers(repo.get_day(check_date_key(date_key)), entry)
        except ValueError as e:
            skipped.append({"date": date_key if isinstance(date_key, str) else None, "reason": str(e)})
            continue
        repo.put_day(day)
        saved += 1
    return {"saved": saved, "skipped": skipped}


# --- dashboard ---

@router.get("/dashboard")
def dashboard(repo: Repo, date_key: Annotated[str | None, Query(alias="date")] = None) -> dict:
    # date.today() is the computer's local date, never UTC.
    today = check_date_key(date_key) if date_key else date.today().isoformat()
    # 12 weeks: the last 7 days for the numbers, the rest for each area's history.
    first = last_n_dates(today, HISTORY_WEEKS * 7)[0]
    # Focus session minutes count as Study and Work hours from here on.
    return build_dashboard(with_focus_hours(repo.days_between(first, today)), repo.get_settings(), today)


# --- insights ---

@router.get("/insights")
def insights(repo: Repo, date_key: Annotated[str | None, Query(alias="date")] = None) -> dict:
    today = check_date_key(date_key) if date_key else date.today().isoformat()
    first = last_n_dates(today, HISTORY_WEEKS * 7)[0]
    return build_insights(with_focus_hours(repo.days_between(first, today)), repo.get_settings(), today)


# --- focus page ---

@router.get("/focus")
def focus(repo: Repo, date_key: Annotated[str | None, Query(alias="date")] = None) -> dict:
    today = check_date_key(date_key) if date_key else date.today().isoformat()
    # From the first saved day (or a year back, for the year grid) to today: the lifetime
    # totals and achievements read them all; the stats page's periods read the last 53 weeks.
    first = last_n_dates(today, YEAR_DAYS)[0]
    earliest = repo.earliest_date()
    if earliest and earliest < first:
        first = earliest
    return focus_page(repo.days_between(first, today), repo.get_settings(), today)


# --- backup and delete ---

@router.get("/export")
def export_backup(repo: Repo) -> dict:
    return repo.export_all()


@router.post("/import")
async def import_backup(request: Request, repo: Repo) -> dict:
    too_large = ApiError(413, "too_large", "Backups must be 2 MB or smaller.")
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_IMPORT_BYTES:
        raise too_large
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_IMPORT_BYTES:
            raise too_large
    try:
        data = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError(400, "bad_json", "The backup file is not valid JSON.") from None
    repo.import_all(data)
    return {"status": "ok"}


@router.delete("/data")
def delete_everything(repo: Repo, x_confirm: Annotated[str | None, Header()] = None) -> dict:
    if x_confirm != CONFIRM_DELETE:
        raise ApiError(400, "confirm_required", f"Send the header X-Confirm: {CONFIRM_DELETE} to delete everything.")
    repo.delete_all()
    return {"status": "ok"}

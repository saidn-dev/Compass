"""The API: URLs under /api that the web page and the Java importer call.

Thin glue only. It calls the rule files and the database and returns JSON.
"""
import json
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Header, Query, Request
from pydantic import BaseModel

from app.areas import AREAS, last_n_dates
from app.dashboard import build_dashboard
from app.db import Repository
from app.lists import check_tasks
from app.models import Settings, check_date_key, merge_numbers
from app.settings_rules import apply_onboarding, check_settings
from app.sleep import Age, HabitId, Role, suggest

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
    check_tasks(body)
    repo.put_day({**body, "date": date_key})
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
    first = last_n_dates(today, 7)[0]
    return build_dashboard(repo.days_between(first, today), repo.get_settings(), today)


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

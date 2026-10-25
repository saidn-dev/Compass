import sqlite3

import pytest

from app.db import SCHEMA_VERSION, Repository
from app.models import Goal, Settings, Target, normalize_day


@pytest.fixture
def repo(tmp_path):
    return Repository(str(tmp_path / "compass.db"))


def sample_day(date="2026-10-20", **fields):
    return normalize_day({"sleep_hours": 7, "note": "hi", **fields}, date)


def sample_settings():
    return Settings(
        onboarded=True,
        modules=["sleep", "steps"],
        targets=[Target(area_id="sleep", target=7.5, mode="up")],
        goals=[Goal(name="Run 5k", percent=40, detail="3 runs a week")],
        theme="dark",
    )


# --- days ---

def test_day_round_trip(repo):
    day = sample_day(steps=9000, tasks=[{"text": "Read ch. 4"}])
    repo.put_day(day)
    assert repo.get_day("2026-10-20") == day


def test_unknown_day_is_empty_not_zero(repo):
    day = repo.get_day("2026-10-20")
    assert day == normalize_day({}, "2026-10-20")
    assert day["sleep_hours"] is None


def test_put_day_overwrites_same_date(repo):
    repo.put_day(sample_day(sleep_hours=6))
    repo.put_day(sample_day(sleep_hours=8))
    assert repo.get_day("2026-10-20")["sleep_hours"] == 8


def test_put_day_cleans_its_input(repo):
    repo.put_day({"date": "2026-10-20", "sleep_hours": "", "evil": 1})
    day = repo.get_day("2026-10-20")
    assert day["sleep_hours"] is None
    assert "evil" not in day


def test_days_between_returns_every_date_in_order(repo):
    repo.put_day(sample_day("2026-10-18", sleep_hours=6))
    repo.put_day(sample_day("2026-10-20", sleep_hours=8))
    repo.put_day(sample_day("2026-10-25", sleep_hours=9))
    days = repo.days_between("2026-10-18", "2026-10-21")
    assert [d["date"] for d in days] == ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]
    assert [d["sleep_hours"] for d in days] == [6, None, 8, None]


def test_data_survives_reopening(tmp_path):
    path = str(tmp_path / "compass.db")
    Repository(path).put_day(sample_day())
    assert Repository(path).get_day("2026-10-20")["note"] == "hi"


def test_sql_injection_text_is_just_text(repo):
    nasty = "'; DROP TABLE days;--"
    repo.put_day(sample_day(note=nasty))
    repo.put_day(sample_day("2026-10-21"))
    assert repo.get_day("2026-10-20")["note"] == nasty
    assert repo.get_day("2026-10-21")["note"] == "hi"


# --- settings ---

def test_fresh_settings_are_defaults(repo):
    assert repo.get_settings() == Settings()


def test_settings_round_trip(repo):
    repo.put_settings(sample_settings())
    assert repo.get_settings() == sample_settings()


def test_unreadable_settings_fall_back_to_defaults(tmp_path):
    path = str(tmp_path / "compass.db")
    Repository(path)
    with sqlite3.connect(path) as conn:
        conn.execute("INSERT OR REPLACE INTO settings (id, json) VALUES (1, 'not json')")
    assert Repository(path).get_settings() == Settings()


# --- export / import ---

def test_export_import_round_trip(repo, tmp_path):
    repo.put_settings(sample_settings())
    repo.put_day(sample_day("2026-10-19"))
    repo.put_day(sample_day("2026-10-20", habits={"walk": True}))
    backup = repo.export_all()
    assert backup["schema"] == SCHEMA_VERSION

    fresh = Repository(str(tmp_path / "other.db"))
    fresh.import_all(backup)
    assert fresh.export_all() == backup


@pytest.mark.parametrize("bad", [
    None,
    [],
    "text",
    {},
    {"schema": 99, "settings": {}, "days": []},
    {"schema": 1, "settings": {"theme": "neon"}, "days": []},
    {"schema": 1, "settings": {}, "days": "nope"},
    {"schema": 1, "settings": {}, "days": [{"date": "not-a-date"}]},
    {"schema": 1, "settings": {}, "days": ["nope"]},
])
def test_bad_import_raises_and_keeps_existing_data(repo, bad):
    repo.put_settings(sample_settings())
    repo.put_day(sample_day())
    before = repo.export_all()
    with pytest.raises(ValueError):
        repo.import_all(bad)
    assert repo.export_all() == before


def test_import_replaces_everything(repo):
    repo.put_day(sample_day("2026-10-01"))
    repo.import_all({"schema": 1, "settings": {}, "days": [{"date": "2026-10-20", "steps": "500"}]})
    backup = repo.export_all()
    assert [d["date"] for d in backup["days"]] == ["2026-10-20"]
    assert backup["days"][0]["steps"] == 500


# --- delete ---

def test_delete_all_returns_to_onboarding(repo):
    repo.put_settings(sample_settings())
    repo.put_day(sample_day())
    repo.delete_all()
    assert repo.get_settings() == Settings()
    assert repo.get_settings().onboarded is False
    assert repo.export_all()["days"] == []


def test_in_memory_database_works():
    repo = Repository(":memory:")
    repo.put_day(sample_day())
    assert repo.get_day("2026-10-20")["note"] == "hi"

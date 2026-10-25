import math

import pytest
from pydantic import ValidationError

from app.areas import AREAS
from app.models import NUMERIC_FIELDS, Goal, Settings, Target, normalize_day

DATE = "2026-10-20"
JUNK = ["", "  ", None, "abc", -3, float("nan"), float("inf"), True, [], {}]


# --- numeric fields: gaps, never zero ---

def test_numeric_fields_match_area_fields():
    assert set(NUMERIC_FIELDS) == {a.field for a in AREAS}


@pytest.mark.parametrize("field", sorted(NUMERIC_FIELDS))
@pytest.mark.parametrize("junk", JUNK, ids=repr)
def test_junk_number_becomes_gap(field, junk):
    assert normalize_day({field: junk}, DATE)[field] is None


@pytest.mark.parametrize("field", sorted(NUMERIC_FIELDS))
def test_real_zero_is_kept(field):
    assert normalize_day({field: 0}, DATE)[field] == 0


@pytest.mark.parametrize("field", sorted(NUMERIC_FIELDS))
def test_missing_field_is_gap(field):
    assert normalize_day({}, DATE)[field] is None


def test_numeric_string_is_parsed():
    assert normalize_day({"sleep_hours": "7.5"}, DATE)["sleep_hours"] == 7.5
    assert normalize_day({"sleep_hours": " 7.5 "}, DATE)["sleep_hours"] == 7.5


@pytest.mark.parametrize("field", ["sleep_hours", "study_hours", "work_hours", "fasting_hours"])
def test_hour_fields_are_0_to_24(field):
    assert normalize_day({field: 24}, DATE)[field] == 24
    assert normalize_day({field: 24.5}, DATE)[field] is None
    assert normalize_day({field: 30}, DATE)[field] is None


def test_steps_are_whole_numbers_with_a_sane_cap():
    assert normalize_day({"steps": 8000.7}, DATE)["steps"] == 8000
    assert normalize_day({"steps": "12000"}, DATE)["steps"] == 12000
    assert normalize_day({"steps": 1e9}, DATE)["steps"] is None


def test_spending_percent_is_0_to_1000():
    assert normalize_day({"spend_pct_of_budget": 1000}, DATE)["spend_pct_of_budget"] == 1000
    assert normalize_day({"spend_pct_of_budget": 1001}, DATE)["spend_pct_of_budget"] is None


# --- tasks ---

def test_tasks_keep_first_three_non_blank():
    raw = {"tasks": [
        {"text": "a"}, {"text": "  "}, {"text": "b", "done": True}, {"text": "c"}, {"text": "d"},
    ]}
    tasks = normalize_day(raw, DATE)["tasks"]
    assert tasks == [
        {"text": "a", "done": False},
        {"text": "b", "done": True},
        {"text": "c", "done": False},
    ]


def test_task_done_must_be_a_real_boolean():
    tasks = normalize_day({"tasks": [{"text": "a", "done": "false"}]}, DATE)["tasks"]
    assert tasks == [{"text": "a", "done": False}]


def test_task_text_is_trimmed_and_capped():
    tasks = normalize_day({"tasks": [{"text": "  " + "x" * 300 + "  "}]}, DATE)["tasks"]
    assert tasks[0]["text"] == "x" * 200


def test_bad_task_shapes_are_dropped():
    raw = {"tasks": ["plain string", None, 5, {"done": True}, {"text": 7}]}
    assert normalize_day(raw, DATE)["tasks"] == []
    assert normalize_day({"tasks": "not a list"}, DATE)["tasks"] == []


# --- habits, note, unknown keys ---

def test_habits_keep_only_real_booleans():
    raw = {"habits": {"walk": True, "read": False, "phone": "yes", "x": 1, "y": None}}
    assert normalize_day(raw, DATE)["habits"] == {"walk": True, "read": False}
    assert normalize_day({"habits": ["walk"]}, DATE)["habits"] == {}


def test_note_is_text_capped_at_5000():
    assert normalize_day({"note": None}, DATE)["note"] == ""
    assert normalize_day({"note": 42}, DATE)["note"] == "42"
    assert normalize_day({"note": "x" * 6000}, DATE)["note"] == "x" * 5000


def test_note_keeps_html_as_plain_text():
    note = "<img src=x onerror=alert(1)>"
    assert normalize_day({"note": note}, DATE)["note"] == note


def test_unknown_keys_dropped_and_shape_complete():
    day = normalize_day({"evil": 1, "date": "1999-01-01"}, DATE)
    assert set(day) == {"date", "habits", "tasks", "note", *NUMERIC_FIELDS}
    assert day["date"] == DATE


def test_bad_date_is_rejected():
    for bad in ["2026-13-01", "yesterday", ""]:
        with pytest.raises(ValueError):
            normalize_day({}, bad)


# --- settings models ---

def test_settings_defaults():
    s = Settings()
    assert s.onboarded is False
    assert s.modules == [] and s.targets == [] and s.habits == [] and s.goals == []
    assert s.theme == "system"


def test_target_must_be_positive():
    for bad in [0, -1, math.nan]:
        with pytest.raises(ValidationError):
            Target(area_id="sleep", target=bad, mode="up")


def test_target_mode_is_up_or_limit():
    with pytest.raises(ValidationError):
        Target(area_id="sleep", target=7.5, mode="sideways")


def test_goal_percent_is_clamped():
    assert Goal(name="Run 5k", percent=150).percent == 100
    assert Goal(name="Run 5k", percent=-5).percent == 0


def test_goal_needs_a_name():
    with pytest.raises(ValidationError):
        Goal(name="   ", percent=10)


def test_settings_caps():
    goal = Goal(name="g", percent=0)
    with pytest.raises(ValidationError):
        Settings(goals=[goal] * 4)
    with pytest.raises(ValidationError):
        Settings(modules=["sleep", "steps", "study", "work", "spending", "fasting"])
    with pytest.raises(ValidationError):
        Settings(theme="neon")

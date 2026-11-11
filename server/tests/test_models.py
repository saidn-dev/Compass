import math

import pytest
from pydantic import ValidationError

from app.areas import AREAS
from app.models import (
    NUMERIC_FIELDS, Goal, Settings, StudyGoal, Target, WorkProfile, WorkSchedule, normalize_day,
)

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


@pytest.mark.parametrize("field", ["sleep_hours", "study_hours", "work_hours"])
def test_hour_fields_are_0_to_24(field):
    assert normalize_day({field: 24}, DATE)[field] == 24
    assert normalize_day({field: 24.5}, DATE)[field] is None
    assert normalize_day({field: 30}, DATE)[field] is None


def test_steps_from_before_movement_was_removed_are_dropped():
    assert "steps" not in normalize_day({"steps": 8000, "work_hours": 2}, DATE)


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
    assert set(day) == {"date", "habits", "tasks", "note", "bedtime", "wake_time", *NUMERIC_FIELDS}
    assert day["date"] == DATE


# --- sleep times: hours are worked out when both are there ---

def test_both_times_set_sleep_hours():
    day = normalize_day({"bedtime": "23:00", "wake_time": "06:30", "sleep_hours": 3}, DATE)
    assert day["sleep_hours"] == 7.5


def test_one_time_keeps_sent_hours():
    day = normalize_day({"bedtime": "23:00", "sleep_hours": 6}, DATE)
    assert day["sleep_hours"] == 6
    assert day["bedtime"] == "23:00" and day["wake_time"] is None


def test_equal_times_give_a_gap():
    day = normalize_day({"bedtime": "22:00", "wake_time": "22:00", "sleep_hours": 6}, DATE)
    assert day["sleep_hours"] is None


def test_junk_time_is_a_gap():
    assert normalize_day({"bedtime": "11pm"}, DATE)["bedtime"] is None


def test_bad_date_is_rejected():
    for bad in ["2026-13-01", "yesterday", "", "20261020", "2026-W43-3", "2026-10-20T00:00"]:
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
        Settings(modules=["sleep", "study", "work", "sleep"])
    with pytest.raises(ValidationError):
        Settings(theme="neon")


# --- study goals ---

def test_study_goal_blank_date_is_none():
    assert StudyGoal(name="Exam", date="").date is None
    assert StudyGoal(name="Exam", date=None).date is None
    assert StudyGoal(name="Exam").date is None


def test_study_goal_keeps_real_date():
    assert StudyGoal(name="Exam", date="2026-12-12").date == "2026-12-12"


@pytest.mark.parametrize("bad", ["2026-02-30", "12/12/2026", "2026-1-5", 20261212], ids=repr)
def test_study_goal_bad_dates_rejected(bad):
    with pytest.raises(ValidationError):
        StudyGoal(name="Exam", date=bad)


def test_study_goal_blank_name_rejected():
    with pytest.raises(ValidationError):
        StudyGoal(name="   ")


def test_settings_allow_five_study_goals_not_six():
    goals = [{"name": f"Goal {i}"} for i in range(6)]
    assert len(Settings(study_goals=goals[:5]).study_goals) == 5
    with pytest.raises(ValidationError):
        Settings(study_goals=goals)


@pytest.mark.parametrize("raw,clean", [(" 2026-12-01 ", "2026-12-01"), ("   ", None)])
def test_study_goal_date_ignores_spaces(raw, clean):
    assert StudyGoal(name="Exam", date=raw).date == clean


# --- work profile ---

WEEK = {"days": [0, 1, 2, 3, 4], "start": "09:00", "end": "17:00"}


def test_work_profile_defaults_are_empty():
    assert Settings().work == WorkProfile()
    assert WorkProfile().model_dump() == {
        "kind": None, "role": None, "schedule": None, "hours_vary": False,
        "focus": None, "goal": None, "derailers": [],
    }


def test_work_schedule_accepts_a_normal_week():
    s = WorkSchedule(**WEEK)
    assert (s.days, s.start, s.end) == ([0, 1, 2, 3, 4], "09:00", "17:00")
    assert WorkSchedule(days=[0], start=" 09:00 ", end="17:00").start == "09:00"


@pytest.mark.parametrize("bad", [
    {**WEEK, "days": []},
    {**WEEK, "days": [0, 0]},
    {**WEEK, "days": [7]},
    {**WEEK, "days": [-1]},
    {**WEEK, "start": "25:00"},
    {**WEEK, "start": "09:00", "end": "09:00"},
])
def test_work_schedule_rejects_bad_input(bad):
    with pytest.raises(ValidationError):
        WorkSchedule(**bad)


def test_work_text_blank_becomes_none():
    p = WorkProfile(role="   ", goal="")
    assert p.role is None and p.goal is None
    assert WorkProfile(role=" Nurse ").role == "Nurse"
    with pytest.raises(ValidationError):
        WorkProfile(goal="x" * 101)


def test_work_derailers_keep_screen_order_and_reject_repeats():
    assert WorkProfile(derailers=["energy", "priorities"]).derailers == ["priorities", "energy"]
    with pytest.raises(ValidationError):
        WorkProfile(derailers=["energy", "energy"])
    with pytest.raises(ValidationError):
        WorkProfile(derailers=["boredom"])


def test_hours_vary_with_a_schedule_is_rejected():
    with pytest.raises(ValidationError):
        WorkProfile(hours_vary=True, schedule=WEEK)


def test_unknown_kind_and_focus_are_rejected():
    with pytest.raises(ValidationError):
        WorkProfile(kind="boss")
    with pytest.raises(ValidationError):
        WorkProfile(focus="night")

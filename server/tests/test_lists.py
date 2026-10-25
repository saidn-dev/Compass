import pytest

from app.lists import add_goal, add_task, habit_completion, toggle_habit, toggle_task
from app.models import Goal, normalize_day

HABITS = [{"id": "read", "name": "Read"}, {"id": "walk", "name": "Walk"}]


def day(**fields) -> dict:
    return normalize_day(fields, fields.pop("date", "2026-10-21"))


# --- toggle_habit ---

def test_toggle_habit_marks_an_unset_habit_done():
    assert toggle_habit(day(), "read")["habits"] == {"read": True}


def test_toggle_habit_twice_undoes_it():
    d = toggle_habit(toggle_habit(day(), "read"), "read")
    assert d["habits"] == {"read": False}


def test_toggle_habit_does_not_change_the_input():
    original = day()
    toggle_habit(original, "read")
    assert original["habits"] == {}


# --- habit_completion ---

def test_completion_counts_only_logged_days():
    days = [
        day(date="2026-10-19", habits={"read": True, "walk": True}),
        day(date="2026-10-20", habits={"read": True}),
        day(date="2026-10-21"),  # nothing logged: not counted as missed
    ]
    assert habit_completion(days, HABITS) == 75.0


def test_a_day_with_only_a_number_logged_counts():
    days = [day(date="2026-10-20", habits={"read": True}), day(date="2026-10-21", sleep_hours=7)]
    assert habit_completion(days, HABITS) == 25.0


def test_a_day_with_only_a_note_or_task_counts():
    days = [day(date="2026-10-20", note="hi"), day(date="2026-10-21", tasks=[{"text": "x"}])]
    assert habit_completion(days, HABITS) == 0.0


def test_completion_is_none_without_habits():
    assert habit_completion([day(habits={"read": True})], []) is None


def test_completion_is_none_without_logged_days():
    assert habit_completion([day(), day(date="2026-10-20")], HABITS) is None


def test_completion_ignores_habits_no_longer_in_the_list():
    assert habit_completion([day(habits={"gone": True, "read": True})], HABITS) == 50.0


# --- add_task / toggle_task ---

def test_add_task_appends_a_not_done_task():
    assert add_task(day(), "  Email tutor  ")["tasks"] == [{"text": "Email tutor", "done": False}]


def test_add_blank_task_raises():
    with pytest.raises(ValueError):
        add_task(day(), "   ")


def test_fourth_task_raises():
    d = day()
    for text in ["a", "b", "c"]:
        d = add_task(d, text)
    with pytest.raises(ValueError):
        add_task(d, "d")


def test_add_task_does_not_change_the_input():
    original = day()
    add_task(original, "a")
    assert original["tasks"] == []


def test_toggle_task_marks_done_and_keeps_it_in_the_list():
    d = toggle_task(add_task(add_task(day(), "a"), "b"), 0)
    assert d["tasks"] == [{"text": "a", "done": True}, {"text": "b", "done": False}]


def test_toggle_task_twice_undoes_it():
    d = add_task(day(), "a")
    assert toggle_task(toggle_task(d, 0), 0)["tasks"] == [{"text": "a", "done": False}]


def test_toggle_task_bad_index_raises():
    with pytest.raises(ValueError):
        toggle_task(add_task(day(), "a"), 1)
    with pytest.raises(ValueError):
        toggle_task(add_task(day(), "a"), -1)


# --- add_goal ---

def test_add_goal_appends():
    goals = add_goal([], Goal(name="Finish thesis", percent=40))
    assert [g.name for g in goals] == ["Finish thesis"]


def test_fourth_goal_raises():
    goals = [Goal(name=n) for n in ["a", "b", "c"]]
    with pytest.raises(ValueError):
        add_goal(goals, Goal(name="d"))


def test_goal_percent_is_clamped():
    assert add_goal([], Goal(name="a", percent=150))[0].percent == 100
    assert add_goal([], Goal(name="a", percent=-5))[0].percent == 0

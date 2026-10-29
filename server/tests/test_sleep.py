import pytest

from app.sleep import (
    AGES, HABIT_TIPS, SHIFT_NOTE, hours_between, minutes_late, parse_time, suggest, time_minus_hours,
)


# --- parse_time: "HH:MM" or a gap ---

@pytest.mark.parametrize("value, expected", [
    ("22:30", "22:30"),
    ("07:05", "07:05"),
    ("00:00", "00:00"),
    ("23:59", "23:59"),
    ("23:00:00", "23:00"),  # some browsers add seconds
])
def test_good_time_is_kept(value, expected):
    assert parse_time(value) == expected


@pytest.mark.parametrize("junk", ["", None, "11pm", "24:00", "7:5", "12:60", 2230, True], ids=repr)
def test_junk_time_is_a_gap(junk):
    assert parse_time(junk) is None


# --- hours_between: wraps past midnight ---

@pytest.mark.parametrize("bed, wake, hours", [
    ("23:00", "06:30", 7.5),
    ("22:30", "06:30", 8),
    ("01:00", "09:00", 8),
    ("23:10", "06:35", 7.42),
])
def test_hours_between(bed, wake, hours):
    assert hours_between(bed, wake) == hours


def test_equal_times_are_a_gap():
    assert hours_between("22:00", "22:00") is None


# --- suggest: hours from age, a bedtime from the wake time, tips from habits ---

def test_everything_skipped_gives_the_adult_range():
    assert suggest(None, None, [], None) == {
        "hours": 8, "range": "7-9 h", "bedtime": None, "wake_time": None, "tips": [], "notes": [],
    }


@pytest.mark.parametrize("age", sorted(AGES))
def test_hours_and_range_follow_the_age(age):
    hours, range_text = AGES[age]
    result = suggest(age, None, [], None)
    assert result["hours"] == hours and result["range"] == range_text


@pytest.mark.parametrize("age, wake, bedtime", [
    ("18_25", "06:30", "22:30"),
    ("65_plus", "05:00", "21:30"),
    ("under_18", "07:00", "22:00"),
])
def test_bedtime_is_worked_back_from_the_wake_time(age, wake, bedtime):
    result = suggest(age, "student", [], wake)
    assert result["bedtime"] == bedtime and result["wake_time"] == wake


@pytest.mark.parametrize("hhmm, hours, expected", [
    ("01:00", 8, "17:00"),
    ("06:30", 7.5, "23:00"),
    ("00:00", 9, "15:00"),
])
def test_time_minus_hours_wraps_past_midnight(hhmm, hours, expected):
    assert time_minus_hours(hhmm, hours) == expected


def test_shift_worker_gets_no_schedule_and_a_note():
    result = suggest(None, "shift_worker", [], "06:30")
    assert result["bedtime"] is None and result["wake_time"] is None
    assert result["notes"] == [SHIFT_NOTE]


def test_tips_follow_the_habit_list_order():
    tips = suggest(None, None, ["nicotine", "alcohol"], None)["tips"]
    assert tips == [HABIT_TIPS["alcohol"], HABIT_TIPS["nicotine"]]


def test_every_habit_has_a_tip():
    assert set(HABIT_TIPS) == {"alcohol", "caffeine", "screens", "naps", "late_meals", "nicotine"}


def test_bad_wake_time_raises():
    with pytest.raises(ValueError):
        suggest(None, None, [], "6am")


# --- minutes_late: works across midnight ---

@pytest.mark.parametrize("actual, planned, late", [
    ("00:15", "23:30", 45),
    ("23:00", "23:30", -30),
    ("23:50", "00:30", -40),
    ("22:30", "22:30", 0),
])
def test_minutes_late(actual, planned, late):
    assert minutes_late(actual, planned) == late

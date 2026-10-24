from datetime import date

import pytest

from app.areas import (
    AREAS,
    area_progress,
    area_status,
    area_value,
    date_key,
    last_n_dates,
    trend,
)


def area(area_id: str):
    return next(a for a in AREAS if a.id == area_id)


def days_with(field: str, values: list) -> list[dict]:
    return [{field: v} for v in values]


# --- dates ---

def test_date_key_is_local_iso_date():
    assert date_key(date(2026, 10, 20)) == "2026-10-20"


def test_last_n_dates_is_oldest_first_and_ends_on_end_key():
    keys = last_n_dates("2026-10-21", 7)
    assert keys == [
        "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
        "2026-10-19", "2026-10-20", "2026-10-21",
    ]


@pytest.mark.parametrize("end_key", ["2026-03-29", "2026-03-30", "2026-11-01", "2026-11-02"])
def test_last_n_dates_across_dst_gives_seven_distinct_days(end_key):
    keys = last_n_dates(end_key, 7)
    assert len(keys) == 7
    assert len(set(keys)) == 7
    assert keys == sorted(keys)
    assert keys[-1] == end_key


def test_last_n_dates_crosses_month_and_year():
    assert last_n_dates("2027-01-02", 3) == ["2026-12-31", "2027-01-01", "2027-01-02"]


def test_last_n_dates_with_zero_is_empty():
    assert last_n_dates("2026-10-21", 0) == []


# --- area list ---

def test_areas_have_readme_defaults():
    expected = {
        "sleep": ("sleep_hours", "avg", 7.5, "up"),
        "steps": ("steps", "avg", 8000, "up"),
        "study": ("study_hours", "sum", 12, "up"),
        "work": ("work_hours", "sum", 16, "up"),
        "spending": ("spend_pct_of_budget", "latest", 100, "limit"),
        "fasting": ("fasting_hours", "avg", 16, "up"),
    }
    assert [a.id for a in AREAS] == list(expected)
    for a in AREAS:
        assert (a.field, a.aggregate, a.default_target, a.default_mode) == expected[a.id]
        assert a.label and a.unit and a.suggestion


# --- area_value ---

def test_sleep_is_averaged_ignoring_gaps():
    days = days_with("sleep_hours", [6, None, 8, None, None, None, None])
    assert area_value(area("sleep"), days) == 7


def test_study_is_summed_ignoring_gaps():
    days = days_with("study_hours", [2, None, 3, 0, None, None, 1])
    assert area_value(area("study"), days) == 6


def test_spending_takes_latest_non_blank():
    days = days_with("spend_pct_of_budget", [40, 55, None])
    assert area_value(area("spending"), days) == 55


def test_all_gaps_is_no_value_not_zero():
    for a in AREAS:
        assert area_value(a, days_with(a.field, [None] * 7)) is None


def test_missing_field_counts_as_gap():
    assert area_value(area("sleep"), [{}, {"sleep_hours": 7}]) == 7


def test_real_zero_is_kept():
    assert area_value(area("work"), days_with("work_hours", [0, 0])) == 0


# --- area_status ---

def test_up_status_at_and_below_target():
    assert area_status(7.5, 7.5, "up") == "on_track"
    assert area_status(7.4, 7.5, "up") == "behind"


def test_limit_status_at_and_over_target():
    assert area_status(100, 100, "limit") == "on_track"
    assert area_status(101, 100, "limit") == "behind"


def test_no_value_is_no_data():
    assert area_status(None, 7.5, "up") == "no_data"


def test_unknown_mode_is_rejected():
    with pytest.raises(ValueError):
        area_status(5, 5, "sideways")


# --- area_progress ---

def test_progress_is_percent_of_target():
    assert area_progress(6, 8, "up") == 75
    assert area_progress(50, 100, "limit") == 50


def test_progress_is_clamped():
    assert area_progress(30, 10, "up") == 200
    assert area_progress(0, 10, "up") == 0


def test_progress_never_divides_by_zero():
    assert area_progress(5, 0, "up") is None
    assert area_progress(5, -1, "limit") is None


def test_progress_without_value_is_none():
    assert area_progress(None, 8, "up") is None


# --- trend ---

def test_trend_up():
    assert trend([5, 5, 5, 8, 8, 8, 8]) == "up"


def test_trend_down():
    assert trend([8, 8, 8, 5, 5, 5, 5]) == "down"


def test_trend_flat_within_five_percent():
    assert trend([100, 100, 100, 104, 104, 104, 104]) == "flat"


def test_trend_needs_two_points():
    assert trend([None] * 6 + [6]) == "none"
    assert trend([]) == "none"


def test_trend_needs_data_in_both_halves():
    assert trend([None, None, None, 6, 7, 8, 9]) == "none"


def test_trend_from_zero():
    assert trend([0, 0, 0, 3, 3, 3, 3]) == "up"
    assert trend([0, 0, 0, 0, 0, 0, 0]) == "flat"

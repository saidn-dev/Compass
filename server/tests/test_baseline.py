from app.areas import AREAS, last_n_dates
from app.baseline import first_logged, learning_day, learning_text, percentile, usual

TODAY = "2026-11-19"
SLEEP = next(a for a in AREAS if a.id == "sleep")
STUDY = next(a for a in AREAS if a.id == "study")


def logged(field: str, values: list) -> dict[str, dict]:
    """by_date for the days ending today, one value each (oldest first); None is a gap."""
    dates = last_n_dates(TODAY, len(values))
    return {k: {"date": k, field: v} for k, v in zip(dates, values) if v is not None}


# --- learning ---

def test_learning_counts_days_from_the_first_log():
    days = [{"date": "2026-11-16", "study_hours": 1}, {"date": "2026-11-18", "sleep_hours": None}]
    assert first_logged(days) == "2026-11-16"
    assert learning_day(days, TODAY) == 4
    assert learning_text(4) == "Learning your rhythm · day 4 of 14"


def test_a_focus_session_counts_as_a_first_log():
    days = [{"date": "2026-11-19", "sessions": [{"minutes": 25}]}]
    assert learning_day(days, TODAY) == 1


def test_no_learning_without_data_or_after_14_days():
    assert learning_day([{"date": "2026-11-19"}], TODAY) is None
    assert learning_day([{"date": "2026-11-06", "sleep_hours": 7}], TODAY) == 14
    assert learning_day([{"date": "2026-11-05", "sleep_hours": 7}], TODAY) is None


# --- usual ---

def test_percentile_between_neighbours():
    assert percentile([1, 2, 3, 4, 5], 0.25) == 2
    assert percentile([1, 2, 3, 4], 0.75) == 3.25
    assert percentile([7], 0.5) == 7


def test_sleep_usual_is_the_middle_half_of_your_nights():
    # 8 weeks of nights alternating 6 and 8 h, then the last 14 at 8 h.
    by_date = logged("sleep_hours", [6, 8] * 35 + [8] * 14)
    got = usual(SLEEP, by_date, TODAY)
    assert (got["low"], got["high"], got["recent"]) == (6, 8, 8)
    assert got["place"] == "within"
    assert got["text"] == "Last 14 days: 8 h a night · your usual 6 to 8 h · Within your usual"


def test_study_usual_uses_weekly_totals_and_skips_empty_weeks():
    # 10 weeks of 7 h (1 a day), 1 empty week... then the last 2 weeks at 14 h (2 a day).
    values = [1] * 63 + [None] * 7 + [2] * 14
    got = usual(STUDY, logged("study_hours", values), TODAY)
    assert got["recent"] == 14
    assert got["place"] == "above"
    assert got["text"].endswith("Above your usual ▲")


def test_below_your_usual():
    values = [2] * 70 + [0.5] * 14
    got = usual(STUDY, logged("study_hours", values), TODAY)
    assert got["place"] == "below" and got["text"].endswith("Below your usual ▼")


def test_too_little_data_has_no_usual():
    assert usual(SLEEP, logged("sleep_hours", [7] * 6), TODAY) is None
    assert usual(STUDY, logged("study_hours", [1] * 7), TODAY) is None


def test_dashboard_shows_usual_after_learning_and_hides_it_during():
    from app.dashboard import build_dashboard
    from app.models import Settings, normalize_day

    s = Settings(onboarded=True, modules=["sleep"])
    days = [normalize_day({"sleep_hours": 7}, k) for k in last_n_dates(TODAY, 84)]
    d = build_dashboard(days, s, TODAY)
    assert d["learning"] is None
    assert d["areas"][0]["usual"]["text"] == "Last 14 days: 7 h a night · your usual 7 h · Within your usual"
    assert d["areas"][0]["headline"] == "Right on course"  # 7 of 7.5 h scores 93

    new = build_dashboard(days[-3:], s, TODAY)
    assert new["learning"]["day"] == 3
    assert new["areas"][0]["usual"] is None
    assert new["areas"][0]["headline"] == "Learning your rhythm"


def test_a_gap_is_never_a_zero():
    # Nights logged only every other day: the gaps don't drag the usual down.
    got = usual(SLEEP, logged("sleep_hours", [7, None] * 42), TODAY)
    assert (got["low"], got["high"]) == (7, 7)
    assert got["text"] == "Last 14 days: 7 h a night · your usual 7 h · Within your usual"

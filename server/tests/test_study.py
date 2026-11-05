from app.models import StudyGoal
from app.study import card_goal, days_left, nearest_goal, study_line, when_text

TODAY = "2026-11-03"


def g(name: str, date: str | None = None) -> StudyGoal:
    return StudyGoal(name=name, date=date)


# --- days left and wording ---

def test_days_left_counts_whole_days():
    assert days_left("2026-11-03", TODAY) == 0
    assert days_left("2026-11-04", TODAY) == 1
    assert days_left("2026-11-15", TODAY) == 12
    assert days_left("2026-11-02", TODAY) == -1


def test_days_left_across_a_month_end():
    assert days_left("2026-12-01", "2026-11-30") == 1


def test_when_text():
    assert when_text(0) == "today"
    assert when_text(1) == "tomorrow"
    assert when_text(12) == "in 12 days"
    assert when_text(-3) == "date passed"


# --- nearest goal ---

def test_upcoming_beats_passed():
    assert nearest_goal([g("Old", "2026-11-01"), g("New", "2026-11-20")], TODAY).name == "New"


def test_closest_upcoming_wins():
    assert nearest_goal([g("B", "2026-12-01"), g("A", "2026-11-10")], TODAY).name == "A"


def test_same_date_first_in_list_wins():
    assert nearest_goal([g("First", "2026-11-10"), g("Second", "2026-11-10")], TODAY).name == "First"


def test_all_passed_gives_latest_within_seven_days():
    assert nearest_goal([g("X", "2026-10-30"), g("Y", "2026-11-01")], TODAY).name == "Y"


def test_passed_goal_kept_for_seven_days_then_dropped():
    assert nearest_goal([g("Gone", "2026-10-27")], TODAY).name == "Gone"
    assert nearest_goal([g("Gone", "2026-10-26")], TODAY) is None


def test_no_dated_goals_gives_none():
    assert nearest_goal([g("Undated")], TODAY) is None
    assert nearest_goal([], TODAY) is None


# --- card goal ---

def test_card_goal_upcoming_text():
    goal = card_goal([g("Data Structures exam", "2026-11-15")], TODAY)
    assert goal == {"name": "Data Structures exam", "date": "2026-11-15", "days_left": 12,
                    "text": "Data Structures exam · in 12 days"}


def test_card_goal_passed_text():
    assert card_goal([g("Exam", "2026-11-01")], TODAY)["text"] == "Exam · date passed"


def test_card_goal_undated_shows_name_only():
    assert card_goal([g("Linear Algebra")], TODAY) == {
        "name": "Linear Algebra", "date": None, "days_left": None, "text": "Linear Algebra"}


def test_card_goal_falls_back_to_undated_when_dated_is_long_past():
    assert card_goal([g("Gone", "2026-10-01"), g("Undated")], TODAY)["text"] == "Undated"


def test_card_goal_none_when_only_long_past():
    assert card_goal([g("Gone", "2026-10-01")], TODAY) is None
    assert card_goal([], TODAY) is None


# --- brief line ---

def test_study_line_upcoming():
    text, fact, upcoming = study_line([g("Data Structures exam", "2026-11-15")], TODAY)
    assert text == "Data Structures exam is in 12 days."
    assert fact == {"area_id": "study", "kind": "deadline", "name": "Data Structures exam",
                    "date": "2026-11-15", "days_left": 12}
    assert upcoming is True


def test_study_line_today_and_tomorrow():
    assert study_line([g("Exam", "2026-11-03")], TODAY)[0] == "Exam is today."
    assert study_line([g("Exam", "2026-11-04")], TODAY)[0] == "Exam is tomorrow."


def test_study_line_passed():
    text, fact, upcoming = study_line([g("Old", "2026-11-01")], TODAY)
    assert text == "The date for Old has passed."
    assert fact["days_left"] == -2
    assert upcoming is False


def test_study_line_none_without_dated_goals():
    assert study_line([g("Undated")], TODAY) is None

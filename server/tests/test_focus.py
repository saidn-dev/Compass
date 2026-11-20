import pytest

from app.focus import (
    add_session, duration_text, focus_review_line, focus_summary, remove_session, with_focus_hours,
)
from app.models import normalize_day

TODAY = "2026-11-19"


def session(area="study", minutes=25, id="s1", task=None, ended_at="10:00") -> dict:
    return {"id": id, "area": area, "task": task, "minutes": minutes, "ended_at": ended_at}


def day(date=TODAY, **fields) -> dict:
    return normalize_day(fields, date)


# --- adding and removing ---

def test_add_session_makes_an_id_and_keeps_the_others():
    first = add_session(day(), {"area": "study", "task": "Essay", "minutes": 25, "ended_at": "10:00"})
    second = add_session(first, {"area": "work", "task": None, "minutes": 50, "ended_at": "11:00"})
    assert len(second["sessions"]) == 2
    ids = [s["id"] for s in second["sessions"]]
    assert len(set(ids)) == 2 and all(isinstance(i, str) and i for i in ids)
    assert second["sessions"][0] == {**first["sessions"][0]}
    assert second["sessions"][1]["area"] == "work"


def test_add_session_never_ticks_a_task():
    d = day(tasks=[{"text": "Essay", "done": False}])
    assert add_session(d, {"area": "study", "task": "Essay", "minutes": 25, "ended_at": "10:00"})["tasks"] == d["tasks"]


def test_add_session_refuses_the_49th():
    full = day(sessions=[session(id=f"s{i}") for i in range(48)])
    with pytest.raises(ValueError, match="48"):
        add_session(full, {"area": "study", "task": None, "minutes": 25, "ended_at": "10:00"})


def test_remove_session():
    d = day(sessions=[session(id="a"), session(id="b")])
    assert [s["id"] for s in remove_session(d, "a")["sessions"]] == ["b"]


def test_remove_unknown_session_raises_lookup_error():
    with pytest.raises(LookupError):
        remove_session(day(sessions=[session(id="a")]), "zzz")


# --- session minutes count as hours ---

def test_sessions_add_to_logged_hours():
    [d] = with_focus_hours([day(study_hours=1, sessions=[session(minutes=25), session(minutes=25, id="s2")])])
    assert d["study_hours"] == pytest.approx(1 + 50 / 60, abs=0.01)
    assert d["work_hours"] is None


def test_sessions_alone_fill_a_gap_and_no_sessions_leave_it():
    gap, filled = with_focus_hours([day("2026-11-18"), day(sessions=[session(area="work", minutes=30)])])
    assert gap["work_hours"] is None and gap["study_hours"] is None
    assert filled["work_hours"] == 0.5
    assert filled["study_hours"] is None


def test_a_real_zero_plus_sessions():
    [d] = with_focus_hours([day(study_hours=0, sessions=[session(minutes=15)])])
    assert d["study_hours"] == 0.25


def test_hours_with_sessions_stop_at_24():
    [d] = with_focus_hours([day(study_hours=23.5, sessions=[session(minutes=50)])])
    assert d["study_hours"] == 24


def test_with_focus_hours_leaves_the_stored_day_alone():
    stored = day(study_hours=1, sessions=[session()])
    with_focus_hours([stored])
    assert stored["study_hours"] == 1


def test_days_without_a_sessions_key_are_fine():
    assert with_focus_hours([{"date": TODAY}]) == [{"date": TODAY}]


# --- words ---

@pytest.mark.parametrize("minutes, text", [(0, "0 min"), (25, "25 min"), (60, "1 h"), (110, "1 h 50 min"), (250, "4 h 10 min")])
def test_duration_text(minutes, text):
    assert duration_text(minutes) == text


def test_focus_summary_today_and_week():
    days = [
        day("2026-11-12", sessions=[session(minutes=50)]),  # 8 days back: not this week
        day("2026-11-13", sessions=[session(minutes=25)]),
        day(sessions=[session(minutes=25), session(area="work", minutes=50, id="s2")]),
    ]
    assert focus_summary(days, TODAY) == {
        "today": {"count": 2, "minutes": 75, "study": 25, "work": 50},
        "week": {"count": 3, "minutes": 100},
    }


def test_focus_summary_with_nothing():
    assert focus_summary([day()], TODAY) == {
        "today": {"count": 0, "minutes": 0, "study": 0, "work": 0},
        "week": {"count": 0, "minutes": 0},
    }


def test_review_line_compares_with_the_week_before():
    week = [day(sessions=[session(minutes=50), session(minutes=50, id="s2")])]
    before = [day("2026-11-10", sessions=[session(minutes=25)])]
    assert focus_review_line(week, before) == "Focus sessions: 2 (1 h 40 min), up from 25 min."


def test_review_line_with_nothing_before_or_the_same():
    week = [day(sessions=[session(minutes=25)])]
    assert focus_review_line(week, []) == "Focus sessions: 1 (25 min)."
    assert focus_review_line(week, week) == "Focus sessions: 1 (25 min), same as the week before."


def test_no_review_line_without_sessions_this_week():
    assert focus_review_line([day(), {"date": TODAY}], [day(sessions=[session()])]) is None

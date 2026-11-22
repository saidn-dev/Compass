import pytest

from app.focus import (
    LEVEL_HOURS, achievements, add_session, duration_text, edit_session, focus_page, focus_review_line,
    focus_summary, longest_run, minutes_by_hour, remove_session, with_focus_hours,
)
from app.models import FocusPrefs, Settings, StudyGoal, normalize_day

TODAY = "2026-11-19"


def session(area="study", minutes=25, id="s1", task=None, ended_at="10:00", note=None) -> dict:
    return {"id": id, "area": area, "task": task, "minutes": minutes, "ended_at": ended_at, "note": note}


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


# --- the Focus page payload ---

def focus_settings(modules=("study", "work"), goals=()) -> Settings:
    return Settings(onboarded=True, modules=list(modules),
                    study_goals=[StudyGoal(name=name) for name in goals])


def test_focus_page_with_no_sessions():
    data = focus_page([day()], focus_settings(), TODAY)
    assert data["summary"] == {
        "today": {"count": 0, "minutes": 0, "study": 0, "work": 0},
        "week": {"count": 0, "minutes": 0, "study": 0, "work": 0},
    }
    assert data["log"] == []
    assert data["tasks"] == {"7d": [], "12w": []}
    assert data["days"][0] == {"date": "2026-11-13", "study": 0, "work": 0}
    assert data["days"][-1] == {"date": TODAY, "study": 0, "work": 0}
    assert len(data["days"]) == 7 and len(data["weeks"]) == 12
    assert data["weeks"][-1] == {"label": "13 Nov", "study": 0, "work": 0}


def test_focus_page_groups_sessions_by_day_and_task():
    days = [
        day("2026-11-18", sessions=[session(area="work", minutes=50, id="w1", task="Ship")]),
        day(TODAY, sessions=[
            session(minutes=25, id="s1", task="Revise"),
            session(minutes=25, id="s2", task="Revise"),
            session(area="work", minutes=30, id="w2", task=None),
        ]),
    ]
    data = focus_page(days, focus_settings(goals=["Revise"]), TODAY)
    assert data["summary"]["week"] == {"count": 4, "minutes": 130, "study": 50, "work": 80}
    assert [d["date"] for d in data["log"]] == [TODAY, "2026-11-18"]
    assert data["log"][0]["minutes"] == 80
    assert data["log"][0]["sessions"][2] == session(area="work", minutes=30, id="w2", task=None)
    assert data["tasks"]["7d"] == [
        {"area": "study", "task": "Revise", "minutes": 50, "count": 2, "goal": True},
        {"area": "work", "task": "Ship", "minutes": 50, "count": 1, "goal": False},
        {"area": "work", "task": None, "minutes": 30, "count": 1, "goal": False},
    ]


def test_focus_page_log_stops_at_14_days_but_tasks_keep_12_weeks():
    days = [day("2026-11-04", sessions=[session(minutes=60, id="old", task="Exam")]), day()]
    data = focus_page(days, focus_settings(), TODAY)
    assert data["log"] == []
    assert data["tasks"]["12w"] == [
        {"area": "study", "task": "Exam", "minutes": 60, "count": 1, "goal": False}
    ]
    assert data["tasks"]["7d"] == []


def test_focus_page_ignores_modules_that_are_switched_off():
    days = [day(TODAY, sessions=[session(minutes=25, id="s1"),
                                 session(area="work", minutes=50, id="w1")])]
    data = focus_page(days, focus_settings(modules=["work"]), TODAY)
    assert "study" not in data["summary"]["today"] and "study" not in data["summary"]["week"]
    assert [s["area"] for d in data["log"] for s in d["sessions"]] == ["work"]
    assert [t["area"] for t in data["tasks"]["7d"]] == ["work"]
    assert all(d["study"] == 0 for d in data["days"])
    assert all(w["study"] == 0 for w in data["weeks"])


def test_focus_page_week_buckets_use_the_dashboard_labels():
    days = [day("2026-11-13", sessions=[session(minutes=50, id="wk")])]
    data = focus_page(days, focus_settings(), TODAY)
    assert data["days"][0] == {"date": "2026-11-13", "study": 50, "work": 0}
    assert data["weeks"][-1] == {"label": "13 Nov", "study": 50, "work": 0}


# --- editing a session, the year grid and the hours ---

def test_edit_session_changes_length_end_and_task_only():
    before = day(TODAY, sessions=[session(id="a", task="Old"), session(id="b", area="work")])
    after = edit_session(before, "a", {"minutes": 40, "ended_at": "11:15", "task": "New", "area": "work", "id": "x"})
    assert after["sessions"][0] == session(id="a", minutes=40, ended_at="11:15", task="New")
    assert after["sessions"][1] == before["sessions"][1]
    assert edit_session(before, "a", {"task": None})["sessions"][0]["task"] is None


def test_edit_session_refuses_unknown_ids_and_bad_values():
    d = day(TODAY, sessions=[session(id="a")])
    with pytest.raises(LookupError):
        edit_session(d, "nope", {"minutes": 10})
    with pytest.raises(ValueError):
        edit_session(d, "a", {"minutes": 0})
    with pytest.raises(ValueError):
        edit_session(d, "a", {"ended_at": "25:00"})


def test_minutes_by_hour_spreads_sessions_over_the_hours_they_ran():
    hours = minutes_by_hour([session(minutes=50, ended_at="10:20"), session(minutes=30, ended_at="00:10")])
    assert hours[9] == 30 and hours[10] == 20
    assert hours[23] == 20 and hours[0] == 10
    assert sum(hours) == 80


def test_focus_page_year_grid_and_hours():
    days = [day("2025-11-21", sessions=[session(id="old", minutes=30)]),
            day(TODAY, sessions=[session(minutes=25, ended_at="09:25")])]
    data = focus_page(days, focus_settings(), TODAY)
    assert len(data["year"]) == 371
    assert data["year"][-1] == {"date": TODAY, "minutes": 25}
    assert data["year"][0] == {"date": "2025-11-14", "minutes": 0}
    assert {"date": "2025-11-21", "minutes": 30} in data["year"]
    assert data["hours"][9] == 25 and sum(data["hours"]) == 25  # the old one is past 12 weeks


# --- notes, the stats page's sessions and achievements ---

def test_a_session_keeps_a_trimmed_note_and_edit_can_change_or_clear_it():
    d = add_session(day(), {"area": "study", "task": None, "minutes": 25, "ended_at": "10:00",
                            "note": "  Read ch 4  "})
    [saved] = d["sessions"]
    assert saved["note"] == "Read ch 4"
    changed = edit_session(d, saved["id"], {"note": "Finished it"})
    assert changed["sessions"][0]["note"] == "Finished it"
    assert edit_session(d, saved["id"], {"note": None})["sessions"][0]["note"] is None


def test_a_long_note_is_cut_and_a_non_text_note_drops_the_session():
    long = day(sessions=[{**session(), "note": "x" * 900}])
    assert len(long["sessions"][0]["note"]) == 500
    assert day(sessions=[{**session(), "note": 5}])["sessions"] == []


def test_focus_page_lists_the_years_sessions_of_switched_on_areas_only():
    days = [day(TODAY, sessions=[session(id="a"), session(id="b", area="work")]),
            day("2025-11-01", sessions=[session(id="old")])]  # more than 53 weeks back
    data = focus_page(days, focus_settings(modules=("study",)), TODAY)
    assert [(s["date"], s["id"]) for s in data["sessions"]] == [(TODAY, "a")]


def test_longest_run_counts_days_in_a_row():
    assert longest_run([]) == 0
    assert longest_run(["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-04"]) == 2
    assert longest_run(["2026-11-30", "2026-12-01", "2026-12-02"]) == 3


def test_achievements_start_at_level_one_with_nothing_earned():
    a = achievements([], 0)
    assert (a["level"], a["hours"], a["next_hours"], a["progress"]) == (1, 0, LEVEL_HOURS[1], 0)
    assert not any(b["earned"] for b in a["badges"])


def test_achievements_level_progress_and_badges():
    pairs = [(f"2026-11-{n:02d}", session(id=str(n), minutes=180, ended_at="12:00")) for n in range(1, 8)]
    a = achievements(pairs, 120)
    assert a["hours"] == 21 and a["level"] == 5  # 20 h reached, 40 h next
    assert a["next_hours"] == 40 and a["progress"] == pytest.approx(0.05)
    earned = {b["id"] for b in a["badges"] if b["earned"]}
    assert earned == {"first", "hours-10", "streak-7", "goal-7"}
    assert a["longest_streak"] == 7 and a["goal_days"] == 7


def test_goal_badges_need_a_goal_and_the_clock_badges_read_start_and_end():
    early = (TODAY, session(minutes=30, ended_at="06:50"))   # started 06:20
    late = (TODAY, session(id="l", minutes=30, ended_at="23:10"))
    a = achievements([early, late], 0)
    earned = {b["id"] for b in a["badges"] if b["earned"]}
    assert {"early", "late"} <= earned and "goal-7" not in earned and a["goal_days"] == 0
    wraps = (TODAY, session(minutes=60, ended_at="00:30"))   # began before midnight
    assert "late" in {b["id"] for b in achievements([wraps], 0)["badges"] if b["earned"]}


def test_the_top_level_has_no_next_step():
    a = achievements([(TODAY, session(minutes=180))] * 400, 0)  # 1200 h
    assert a["level"] == len(LEVEL_HOURS) and a["next_hours"] is None and a["progress"] == 1.0


def test_focus_prefs_defaults_keep_todays_timer():
    p = FocusPrefs()
    assert (p.daily_goal, p.short_break, p.long_break, p.long_break_every) == (0, 5, 15, 4)
    assert p.auto_break and p.auto_focus and not p.strict and p.estimates == {}


def test_focus_prefs_clean_estimates_and_reject_bad_numbers():
    p = FocusPrefs(estimates={" Essay ": 4, "": 2, "Zero": 0, "Big": 21, "Bool": True, "Text": "3"})
    assert p.estimates == {"Essay": 4}
    with pytest.raises(ValueError):
        FocusPrefs(long_break_every=1)
    with pytest.raises(ValueError):
        FocusPrefs(daily_goal=721)
    with pytest.raises(ValueError):
        FocusPrefs(estimates={f"t{i}": 1 for i in range(51)})

from datetime import date, timedelta

from app.models import Settings, StartingPoint, StudyGoal, normalize_day
from app.progress import focus_report, goal_pace

TODAY = "2026-11-19"  # a Thursday


def key(back: int) -> str:
    return (date.fromisoformat(TODAY) - timedelta(days=back)).isoformat()


def days(entries: dict[int, dict]) -> list[dict]:
    """Days by how many days back they are: {0: today's fields, 1: yesterday's, ...}."""
    return [normalize_day(fields, key(back)) for back, fields in sorted(entries.items(), reverse=True)]


def study(**more) -> Settings:
    return Settings(modules=["study"], **more)


def session(task: str, minutes: int, area: str = "study") -> dict:
    return {"id": f"s{minutes}{task[:3]}", "area": area, "task": task, "minutes": minutes, "ended_at": "10:00"}


# --- the Focus Report ---

def test_report_is_locked_for_the_first_7_days():
    s = study(starting_point=StartingPoint(date=key(2), study_hours=5))
    got = focus_report([], s, TODAY)
    assert got == {"locked": True, "day": 3, "text": "Your first Focus Report unlocks on Tue 24 Nov · day 3 of 7."}


def test_report_without_a_start_or_any_log():
    assert focus_report([], study(), TODAY)["locked"] is True


def test_no_report_without_study_or_work():
    assert focus_report([], Settings(modules=["sleep"]), TODAY) is None


def test_report_against_the_starting_estimate_with_time_reclaimed():
    # Started 14 days ago estimating 5 h a week; logged 1 h a day since (7 h a week).
    s = study(starting_point=StartingPoint(date=key(13), study_hours=5))
    d = days({b: {"study_hours": 1} for b in range(14)} | {0: {"study_hours": 2}})
    got = focus_report(d, s, TODAY)
    assert got["locked"] is False
    assert got["lines"] == [
        "This week: 8 h of focus.",
        "Best day: Thu 19 Nov (2 h). Lightest day: Fri 13 Nov (1 h).",
        "3 h a week over your starting estimate of 5 h a week.",
        "Since you started: 5 h reclaimed.",  # 3 h this week + 2 h the week before
    ]


def test_report_without_an_estimate_uses_the_first_week():
    d = days({b: {"study_hours": 1} for b in range(7, 14)} | {b: {"study_hours": 0.5} for b in range(7)})
    got = focus_report(d, study(), TODAY)
    assert "3.5 h under your first week (7 h) this week." in got["lines"]
    assert got["lines"][-1] == "Since you started: weeks above your starting pace add up here."


def test_report_counts_work_and_study_together_and_never_a_gap_as_zero():
    s = Settings(modules=["study", "work"], starting_point=StartingPoint(date=key(20), study_hours=3, work_hours=10))
    d = days({0: {"study_hours": 1, "work_hours": 2}, 3: {"work_hours": 4}})
    got = focus_report(d, s, TODAY)
    assert got["lines"][0] == "This week: 7 h of focus."
    assert got["lines"][2] == "6 h under your starting estimate of 13 h a week this week."


# --- goal pace ---

def goal(**more) -> StudyGoal:
    return StudyGoal(name="Revise chapter 5", **{"date": "2026-11-27", "hours": 10, **more})


def test_late_at_this_pace_says_how_much_more_a_day_closes_it():
    # 5.5 h done (3.5 h in the last 14 days: 15 min a day). 4.5 h left, 8 days to go.
    d = days({1: {"sessions": [session("Revise chapter 5", 120)]}, 20: {"sessions": [session("Revise chapter 5", 120)]},
              5: {"sessions": [session("Revise chapter 5", 90)]}})
    assert goal_pace(goal(), d, TODAY) == (
        "At this pace you'll reach Revise chapter 5 by Mon 7 Dec, 10 days late. 20 min more a day closes it.")


def test_early_at_this_pace():
    d = days({b: {"sessions": [session("Revise chapter 5", 60)]} for b in range(14)})
    # 14 h done of 20: 1 h a day, 6 h left: ready in 6 days, 2 days early.
    assert goal_pace(goal(hours=20), d, TODAY) == (
        "At this pace you'll be ready for Revise chapter 5 by Wed 25 Nov, 2 days early.")


def test_no_sessions_lately_says_what_a_day_gets_you_there():
    assert goal_pace(goal(), [], TODAY) == (
        "No sessions on Revise chapter 5 in the last 14 days. 1 h 15 min a day gets you there by Fri 27 Nov.")


def test_done_and_no_pace_cases():
    d = days({1: {"sessions": [session("Revise chapter 5", m) for m in (150, 160, 170, 180)]}})
    assert goal_pace(goal(), d, TODAY) == "Revise chapter 5: all 10 h done."
    assert goal_pace(goal(hours=None), [], TODAY) is None
    assert goal_pace(goal(date=None), [], TODAY) is None
    assert goal_pace(goal(date="2026-11-01"), [], TODAY) is None


def test_only_study_sessions_on_that_goal_count():
    d = days({1: {"sessions": [session("Revise chapter 5", 60, "work"), session("Other", 60)]}})
    assert goal_pace(goal(), d, TODAY).startswith("No sessions on Revise chapter 5")

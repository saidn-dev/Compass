import pytest

from app.models import Settings, SleepSchedule, StudyGoal, Target, WorkProfile, WorkSchedule
from app.pages import module_details, work_days_text

TODAY = "2026-11-12"
STOP = "This week's tip: Pick a time to stop work today and keep to it."


def nights(*bedtimes):
    return [{"bedtime": b} for b in bedtimes]


def with_schedule():
    return Settings(modules=["sleep"], sleep_schedule=SleepSchedule(bedtime="22:30", wake_time="06:00"))


def work(target=16, mode="up", **profile):
    return Settings(modules=["work"], targets=[Target(area_id="work", target=target, mode=mode)],
                    work=WorkProfile(**profile))


WEEK = WorkSchedule(days=[0, 1, 2, 3, 4], start="09:00", end="17:00")


def test_sleep_goal():
    s = Settings(modules=["sleep"], targets=[Target(area_id="sleep", target=7.5, mode="up")])
    assert module_details("sleep", s, [], TODAY) == {"title": "Your goal", "lines": ["7.5 h a night"]}


def test_sleep_schedule_without_enough_bedtimes():
    d = module_details("sleep", with_schedule(), nights("22:00", "23:30", "23:45"), TODAY)
    assert d == {"title": "Your schedule", "lines": ["In bed 22:30 · Up 06:00"]}


def test_sleep_schedule_with_bedtime_line():
    d = module_details("sleep", with_schedule(), nights("22:00", "22:15", "23:30", "23:45", "00:30"), TODAY)
    assert d["lines"] == ["In bed 22:30 · Up 06:00", "In bed after 22:30 on 3 of 5 nights."]


def test_study_goals_in_saved_order():
    s = Settings(modules=["study"], study_goals=[
        StudyGoal(name="Exam", date="2026-11-24"), StudyGoal(name="Essay", date="2026-10-01"),
        StudyGoal(name="Thesis"), StudyGoal(name="Quiz", date="2026-11-12")])
    assert module_details("study", s, [], TODAY) == {"title": "Your goals", "lines": [
        "Exam · in 12 days", "Essay · date passed", "Thesis", "Quiz · today"]}


def test_study_without_goals():
    d = module_details("study", Settings(modules=["study"]), [], TODAY)
    assert d["lines"] == ["No study goals yet."]


def test_work_full_profile():
    s = work(40, "up", kind="freelance", role="Software developer", goal="Fix 3 bugs", schedule=WEEK,
             focus="morning", derailers=["procrastination"])
    assert module_details("work", s, [], TODAY) == {"title": "Your work", "lines": [
        "Software developer",
        "Goal: Fix 3 bugs",
        "Mon to Fri, 09:00 to 17:00 · 40 h a week",
        "This week's tip: Spend 10 minutes in the morning on the task you've been putting off."]}


def test_work_hours_vary():
    d = module_details("work", work(25, "up", hours_vary=True), [], TODAY)
    assert "Hours vary · 25 h a week" in d["lines"]


def test_work_empty_profile_has_only_the_tip():
    d = module_details("work", Settings(modules=["work"]), [], TODAY)
    assert d["lines"] == ["This week's tip: Block 30 minutes today for your most urgent task."]


def test_work_limit_mode_gives_the_stop_tip():
    d = module_details("work", work(40, "limit", kind="employed"), [], TODAY)
    assert d["lines"][-1] == STOP


@pytest.mark.parametrize("days, text", [
    ([0, 1, 2, 3, 4], "Mon to Fri"),
    ([0, 2, 4], "Mon, Wed, Fri"),
    ([5], "Sat"),
    ([5, 6], "Sat to Sun"),
    ([0, 1, 3], "Mon, Tue, Thu"),
    ([0, 1, 2, 3, 4, 5, 6], "Mon to Sun"),
])
def test_work_days_text(days, text):
    assert work_days_text(days) == text


# --- contributors (the bars under a module's score) ---

from app.pages import module_contributors


def days(field, values):
    return [{field: v, "bedtime": None} for v in values]


def test_contributors_hours_and_logging():
    s = Settings(modules=["study"], targets=[Target(area_id="study", target=12, mode="up")])
    got = module_contributors("study", s, days("study_hours", [2, None, 3, None, None, 1, None]))
    assert got == [
        {"label": "Hours", "text": "6 h this week", "score": 50, "level": "Pay attention"},
        {"label": "Logging", "text": "3 of 7 days", "score": 43, "level": "Pay attention"},
    ]


def test_contributors_with_nothing_logged():
    s = Settings(modules=["work"])
    got = module_contributors("work", s, days("work_hours", [None] * 7))
    assert got[0] == {"label": "Hours", "text": "Not logged", "score": None, "level": "No data"}
    assert got[1] == {"label": "Logging", "text": "0 of 7 days", "score": 0, "level": "Pay attention"}


def test_sleep_contributors_average_and_bedtime():
    window = [{"sleep_hours": h, "bedtime": b} for h, b in [
        (7.5, "22:00"), (7.5, "22:15"), (7.5, "23:30"), (7.5, "23:45"), (None, None), (None, None), (None, None)]]
    got = module_contributors("sleep", with_schedule(), window)
    assert [c["label"] for c in got] == ["Hours", "Bedtime", "Logging"]
    assert got[0]["text"] == "7.5 h average a night"
    assert got[1] == {"label": "Bedtime", "text": "2 of 4 nights on time", "score": 50, "level": "Pay attention"}


def test_sleep_goal_has_no_bedtime_contributor():
    s = Settings(modules=["sleep"])
    got = module_contributors("sleep", s, days("sleep_hours", [8] * 7))
    assert [c["label"] for c in got] == ["Hours", "Logging"]
    assert got[1] == {"label": "Logging", "text": "7 of 7 days", "score": 100, "level": "Optimal"}


def test_sleep_schedule_with_no_bedtimes_logged():
    got = module_contributors("sleep", with_schedule(), days("sleep_hours", [None] * 7))
    assert got[1] == {"label": "Bedtime", "text": "No bedtimes logged", "score": None, "level": "No data"}

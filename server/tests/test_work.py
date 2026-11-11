import pytest

from app.models import WorkProfile, WorkSchedule
from app.work import ALL_WORK_TIPS, week_hours, work_card, work_tip

STOP = "Pick a time to stop work today and keep to it."


def sched(days, start, end):
    return WorkSchedule(days=days, start=start, end=end)


def test_week_hours():
    assert week_hours(sched([0, 1, 2, 3, 4], "09:00", "17:00")) == 40
    assert week_hours(sched([5], "22:00", "06:00")) == 8
    assert week_hours(sched([2], "09:00", "12:30")) == 3.5
    assert week_hours(sched([0, 1, 2, 3, 4, 5, 6], "00:00", "23:00")) == 161


@pytest.mark.parametrize("derailer, tip", [
    ("priorities", "Pick the one task that matters most this week and give it 30 minutes today."),
    ("procrastination", "Spend 10 minutes today on the task you've been putting off."),
    ("interruptions", "Turn off notifications for one 30-minute block today."),
    ("energy", "Do 30 minutes on your hardest task today, then take a short break."),
    ("projects", "Choose one project to move forward today and leave the rest for now."),
])
def test_tip_for_each_derailer(derailer, tip):
    got = work_tip(WorkProfile(derailers=[derailer]), "up")
    assert got == tip
    assert got in ALL_WORK_TIPS


def test_tip_fills_in_focus_time():
    p = WorkProfile(focus="morning", derailers=["priorities"])
    assert work_tip(p, "up") == "Pick the one task that matters most this week and give it 30 minutes in the morning."
    p = WorkProfile(focus="varies", derailers=["priorities"])
    assert work_tip(p, "up").endswith("30 minutes today.")
    assert "in the afternoon" in work_tip(WorkProfile(focus="afternoon"), "up")


def test_tip_uses_the_first_derailer_in_screen_order():
    p = WorkProfile(derailers=["interruptions", "priorities"])
    assert work_tip(p, "up").startswith("Pick the one task")


def test_something_else_only_gives_the_general_tip():
    p = WorkProfile(derailers=["other"], focus="evening")
    got = work_tip(p, "up")
    assert got == "Block 30 minutes in the evening for your most urgent task."
    assert got in ALL_WORK_TIPS


def test_limit_mode_gives_the_stop_tip():
    full = WorkProfile(focus="morning", derailers=["priorities"])
    assert work_tip(WorkProfile(), "limit") == STOP
    assert work_tip(full, "limit") == STOP


def test_empty_profile_tip():
    assert work_tip(WorkProfile(), "up") == "Block 30 minutes today for your most urgent task."


def test_all_work_tips_covers_every_case():
    assert STOP in ALL_WORK_TIPS
    assert len(ALL_WORK_TIPS) == 6 * 4 + 1
    assert len(set(ALL_WORK_TIPS)) == len(ALL_WORK_TIPS)


def test_card_text():
    assert work_card(WorkProfile(role="Software developer", goal="Fix 3 bugs")) == {
        "text": "Software developer · Goal: Fix 3 bugs"}
    assert work_card(WorkProfile(role="Software developer")) == {"text": "Software developer"}
    assert work_card(WorkProfile(goal="Fix 3 bugs")) == {"text": "Goal: Fix 3 bugs"}
    assert work_card(WorkProfile()) is None

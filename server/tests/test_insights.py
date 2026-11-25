from datetime import date, timedelta

import pytest

from app.insights import (
    active_shield, bedtime_guidance, build_history, build_insights, build_review, carry_over, find_patterns,
    find_streaks,
)
from app.models import Habit, Settings, Shield, SleepSchedule, Target, normalize_day

TODAY = "2026-11-13"  # a Friday


def key(back: int) -> str:
    return (date.fromisoformat(TODAY) - timedelta(days=back)).isoformat()


def days(entries: dict[int, dict]) -> list[dict]:
    """Days by how many days back they are: {0: today's fields, 1: yesterday's, ...}."""
    return [normalize_day(fields, key(back)) for back, fields in entries.items()]


def settings(*modules, **more) -> Settings:
    return Settings(modules=list(modules), **more)


# --- patterns ---

def test_sleep_to_study_pattern():
    d = days({**{b: {"sleep_hours": 8, "study_hours": 3} for b in (1, 2, 3, 4)},
              **{b: {"sleep_hours": 6, "study_hours": 1} for b in (5, 6, 7, 8)}})
    got = find_patterns(d, settings("sleep", "study"), TODAY)
    assert got[0]["text"] == "On days after 7.5+ h of sleep you studied 3 h on average, against 1 h on other days."
    assert got[0]["detail"] == "4 days against 4, from the last 4 weeks."


def test_pattern_needs_three_days_on_each_side():
    d = days({1: {"sleep_hours": 8, "study_hours": 3}, 2: {"sleep_hours": 8, "study_hours": 3},
              **{b: {"sleep_hours": 6, "study_hours": 1} for b in (5, 6, 7, 8)}})
    assert find_patterns(d, settings("sleep", "study"), TODAY) == []


def test_pattern_needs_a_real_difference():
    d = days({**{b: {"sleep_hours": 8, "study_hours": 2.1} for b in (1, 2, 3)},
              **{b: {"sleep_hours": 6, "study_hours": 2} for b in (5, 6, 7)}})
    assert find_patterns(d, settings("sleep", "study"), TODAY) == []


def test_tag_pattern():
    d = days({**{b: {"sleep_hours": 6, "tags": ["caffeine"]} for b in (1, 2, 3)},
              **{b: {"sleep_hours": 8} for b in (4, 5, 6)}})
    got = find_patterns(d, settings("sleep"), TODAY)
    assert [p["text"] for p in got] == [
        "On days tagged Caffeine late you slept 6 h on average, against 8 h on other days."]


def test_mood_pattern():
    d = days({**{b: {"sleep_hours": 8, "mood": 4} for b in (1, 2, 3)},
              **{b: {"sleep_hours": 6, "mood": 2} for b in (4, 5, 6)}})
    got = find_patterns(d, settings("sleep"), TODAY)
    assert got[0]["text"] == "On days after 7.5+ h of sleep your mood averaged 4 out of 5, against 2 on other days."


def test_patterns_only_use_modules_that_are_on_and_the_last_four_weeks():
    d = days({**{b: {"sleep_hours": 8, "study_hours": 3} for b in (1, 2, 3)},
              **{b: {"sleep_hours": 6, "study_hours": 1} for b in (4, 5, 6)}})
    assert find_patterns(d, settings("sleep"), TODAY) == []
    old = days({**{b: {"sleep_hours": 8, "study_hours": 3} for b in (30, 31, 32)},
                **{b: {"sleep_hours": 6, "study_hours": 1} for b in (33, 34, 35)}})
    assert find_patterns(old, settings("sleep", "study"), TODAY) == []


def test_patterns_biggest_difference_first_and_at_most_five():
    entries = {}
    for b in (1, 2, 3):
        entries[b] = {"sleep_hours": 8, "study_hours": 4, "work_hours": 3, "mood": 5,
                      "tags": ["exercise", "social", "travel"]}
    for b in (4, 5, 6):
        entries[b] = {"sleep_hours": 6, "study_hours": 1, "work_hours": 2, "mood": 2}
    got = find_patterns(days(entries), settings("sleep", "study", "work"), TODAY)
    assert len(got) == 5
    assert "studied 4 h" in got[0]["text"]


# --- streaks ---

def test_a_streak_still_alive_flickers_until_today_is_done():
    d = days({1: {"sleep_hours": 7}, 2: {"study_hours": 1}, 3: {"sleep_hours": 7}})
    got = find_streaks(d, settings("sleep", "study"), TODAY)
    assert got[0] == {"label": "Logging", "days": 3, "best": 3, "state": "flicker", "revived": 0,
                      "text": "3 days · do it today to keep it lit"}


def test_one_missed_day_fades_and_doing_it_the_next_day_revives_it():
    # Done 5, missed 4, done 3, 2, 1: the miss didn't end the streak, and it was revived.
    d = days({1: {"sleep_hours": 7}, 2: {"study_hours": 1}, 3: {"sleep_hours": 7}, 5: {"sleep_hours": 7}})
    got = find_streaks(d, settings("sleep", "study"), TODAY)[0]
    assert (got["days"], got["state"], got["revived"]) == (4, "flicker", 1)
    assert got["text"] == "4 days · do it today to keep it lit · revived 1 time"


def test_a_streak_fades_after_one_missed_day():
    d = days({2: {"sleep_hours": 7}, 3: {"sleep_hours": 7}})
    got = find_streaks(d, settings("sleep"), TODAY)[0]
    assert (got["days"], got["state"], got["text"]) == (2, "fade", "Fading · do it today to revive 2 days")


def test_two_missed_days_end_a_streak_and_today_lights_a_new_one():
    entries = {b: {"sleep_hours": 7} for b in (0, 1, 4, 5, 6, 7, 8)}
    got = find_streaks(days(entries), settings("sleep"), TODAY)[0]
    assert (got["days"], got["best"], got["state"], got["text"]) == (2, 5, "lit", "2 days · lit")


def test_after_two_misses_it_says_start_again():
    got = find_streaks(days({3: {"sleep_hours": 7}, 4: {"sleep_hours": 7}}), settings("sleep"), TODAY)[0]
    assert (got["days"], got["state"], got["text"]) == (0, "out", "Start again today")


def test_rest_days_and_pauses_neither_count_nor_break_a_streak():
    d = days({1: {"sleep_hours": 7}, 2: {"rest": True}, 3: {"rest": True}, 4: {"sleep_hours": 7},
              6: {"sleep_hours": 7}})
    paused = settings("sleep", shields=[Shield(start=key(6), end=key(5), reason="holiday")])
    got = find_streaks(d, paused, TODAY)[0]
    # Day 5 is paused and days 2-3 are rest days: 6, 4 and 1 make 3 days with no miss.
    assert (got["days"], got["state"], got["revived"]) == (3, "flicker", 0)
    without = find_streaks(d, settings("sleep"), TODAY)[0]
    assert without["revived"] == 1  # day 5 counts as a miss without the pause


def test_no_streak_yet():
    got = find_streaks([], settings("sleep"), TODAY)
    assert got[0] == {"label": "Logging", "days": 0, "best": 0, "state": "out", "revived": 0,
                      "text": "No streak yet"}


def test_active_shield_and_its_words():
    s = settings("sleep", shields=[Shield(start=key(2), end="2026-11-20", reason="exam")])
    assert active_shield(s, TODAY)["text"] == "Exam period: streaks paused until 20 Nov."
    assert active_shield(settings("sleep"), TODAY) is None


def test_habit_and_bedtime_streaks():
    s = settings("sleep", habits=[Habit(id="h1", name="Morning walk")],
                 sleep_schedule=SleepSchedule(bedtime="22:30", wake_time="06:30"))
    d = days({0: {"habits": {"h1": True}, "bedtime": "22:40", "wake_time": "06:30"},
              1: {"habits": {"h1": True}, "bedtime": "23:50", "wake_time": "06:30"},
              2: {"habits": {"h1": False}, "bedtime": "22:00", "wake_time": "06:30"}})
    got = {x["label"]: x for x in find_streaks(d, s, TODAY)}
    assert got["Morning walk"]["text"] == "2 days · lit"
    # On time, late, on time: the late night faded the streak and tonight revived it.
    assert got["Bedtime on time"]["text"] == "2 days · lit · revived 1 time"
    assert list(got) == ["Logging", "Bedtime on time", "Morning walk"]


# --- weekly review ---

def test_review_compares_this_week_with_the_one_before():
    entries = {b: {"sleep_hours": 7.5, "study_hours": 2} for b in range(0, 7)}
    entries[3] = {"sleep_hours": 8.5, "study_hours": 4}
    entries.update({b: {"sleep_hours": 6, "study_hours": 1} for b in range(7, 14)})
    r = build_review(days(entries), settings("sleep", "study"), TODAY)
    assert r["range"] == "7 Nov to 13 Nov"
    sleep, study = r["modules"]
    assert sleep["value_text"] == "7.6 h average a night"
    assert sleep["change_text"] == "Up from 6 h."
    assert sleep["best"] == "Best day: Tuesday (8.5 h)."
    assert (sleep["score"], sleep["score_label"], sleep["previous_score"]) == (100, "Optimal", 80)
    assert study["value_text"] == "16 h this week"
    assert study["change_text"] == "Up from 7 h."
    assert r["score"] == {"value": 100, "previous": 69, "label": "Optimal", "headline": "Right on course",
                          "text": "Up 31 from the week before."}
    assert r["change"] == "Keep doing what you're doing."


def test_review_with_nothing_before_and_something_to_change():
    entries = {b: {"sleep_hours": 7.5, "study_hours": 1} for b in range(0, 7)}
    r = build_review(days(entries), settings("sleep", "study"), TODAY)
    assert r["modules"][1]["change_text"] == "Nothing logged the week before."
    assert r["score"]["text"] == ""
    assert r["change"] == "One thing to change: Do one 30-minute study block on your nearest deadline."


def test_review_with_no_data():
    r = build_review([], settings("sleep"), TODAY)
    assert r["modules"][0]["value_text"] == "Nothing logged"
    assert r["modules"][0]["change_text"] == ""
    assert r["modules"][0]["best"] is None
    assert r["score"]["value"] is None
    assert r["change"] is None
    assert r["extras"] == []


def test_review_extras_habits_tasks_and_mood():
    s = settings("sleep", habits=[Habit(id="h1", name="Walk")])
    entries = {b: {"sleep_hours": 7.5, "habits": {"h1": b % 2 == 0}, "mood": 4,
                   "tasks": [{"text": "a", "done": True}, {"text": "b", "done": False}]} for b in range(0, 4)}
    entries.update({b: {"sleep_hours": 7.5, "habits": {"h1": False}, "mood": 2} for b in range(7, 11)})
    r = build_review(days(entries), s, TODAY)
    assert r["extras"] == [
        "Habits: 50% done, up from 0%.",
        "Focus tasks: 4 of 8 done.",
        "Mood: 4 out of 5 on average, up from 2.",
    ]


def test_review_extras_focus_sessions_after_focus_tasks():
    s = settings("study")
    sessions = [{"id": f"s{i}", "area": "study", "task": None, "minutes": 50, "ended_at": "10:00"} for i in range(3)]
    entries = {0: {"tasks": [{"text": "a", "done": True}], "sessions": sessions},
               8: {"sessions": sessions[:1]}}
    r = build_review(days(entries), s, TODAY)
    assert r["extras"] == ["Focus tasks: 1 of 1 done.", "Focus sessions: 3 (2 h 30 min), up from 50 min."]


# --- history, carry-over, bedtime guidance ---

def test_history_is_twelve_weeks_oldest_first():
    entries = {b: {"study_hours": 2} for b in range(0, 7)}
    entries[20] = {"study_hours": 5}
    study = next(a for a in __import__("app.areas", fromlist=["AREAS"]).AREAS if a.id == "study")
    h = build_history(study, {d["date"]: d for d in days(entries)}, TODAY)
    assert len(h) == 12
    assert h[-1] == {"label": "7 Nov", "value": 14}
    assert h[-3] == {"label": "24 Oct", "value": 5}
    assert h[0] == {"label": "22 Aug", "value": None}


def test_carry_over_lists_yesterdays_unfinished_tasks_not_already_planned():
    d = days({1: {"tasks": [{"text": "Call the bank", "done": False, "area": "work"},
                            {"text": "Read ch. 3", "done": False}, {"text": "Old task", "done": False}]},
              0: {"tasks": [{"text": "Read ch. 3", "done": False}]}})
    assert carry_over({x["date"]: x for x in d}, TODAY) == [{"text": "Call the bank", "area": "work"},
                                                         {"text": "Old task"}]
    finished = days({1: {"tasks": [{"text": "Email Sam", "done": True, "area": "work"}]}})
    assert carry_over({x["date"]: x for x in finished}, TODAY) == []


def test_carry_over_offers_every_unfinished_task_however_full_today_is():
    busy = days({1: {"tasks": [{"text": t, "done": False} for t in "vwxyz"]},
                 0: {"tasks": [{"text": t, "done": False} for t in "abcd"]}})
    assert [t["text"] for t in carry_over({x["date"]: x for x in busy}, TODAY)] == list("vwxyz")
    assert carry_over({}, TODAY) == []


def schedule(target=8.0):
    return settings("sleep", targets=[Target(area_id="sleep", target=target, mode="up")],
                    sleep_schedule=SleepSchedule(bedtime="22:30", wake_time="06:30"))


def test_bedtime_guidance_when_on_track():
    d = days({b: {"sleep_hours": 8} for b in (1, 2, 3)})
    assert bedtime_guidance(schedule(), d) == "Tonight: aim to be in bed by 22:30."


def test_bedtime_guidance_moves_earlier_when_short():
    d = days({b: {"sleep_hours": 7.25} for b in (1, 2, 3)})
    assert bedtime_guidance(schedule(), d) == (
        "Tonight: aim to be in bed by 21:45. You're about 45 minutes a night short over your last 3 nights.")


def test_bedtime_guidance_never_moves_more_than_an_hour():
    d = days({b: {"sleep_hours": 5} for b in (1, 2, 3)})
    assert bedtime_guidance(schedule(), d).startswith("Tonight: aim to be in bed by 21:30.")


def test_bedtime_guidance_needs_a_schedule():
    assert bedtime_guidance(settings("sleep"), []) is None
    assert bedtime_guidance(schedule(), []) == "Tonight: aim to be in bed by 22:30."


def test_build_insights_has_every_part():
    got = build_insights([], settings("sleep"), TODAY)
    assert set(got) == {"date", "review", "patterns", "streaks", "shield", "focus_report"}

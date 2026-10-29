import re

from app.areas import AREAS, last_n_dates
from app.brief import LOW_SLEEP_LINE, build_brief
from app.models import Settings, SleepSchedule, normalize_day
from app.settings_rules import apply_onboarding, check_settings

TODAY = "2026-10-21"  # a Wednesday
FIRST_BRIEF = "Log today's numbers to get your first brief."
SUGGESTIONS = {a.suggestion for a in AREAS}


def week(**series) -> list[dict]:
    """Seven days ending TODAY; each keyword is a field with 7 values (None = gap)."""
    dates = last_n_dates(TODAY, 7)
    return [
        normalize_day({field: values[i] for field, values in series.items()}, d)
        for i, d in enumerate(dates)
    ]


def settings(*modules: str) -> Settings:
    return apply_onboarding(Settings(), list(modules))


def numbers_in(text: str) -> list[float]:
    return [float(n) for n in re.findall(r"\d+(?:\.\d+)?", text)]


def measured_sentences(brief: dict) -> list[str]:
    """Every sentence except the action, whose duration is not a measurement."""
    return [s for s in brief["sentences"] if s not in SUGGESTIONS]


# (a) furthest-behind area is named with its number

def test_sleep_behind_is_named_with_its_average():
    days = week(
        sleep_hours=[6, 6.5, 6.5, 6.4, 6.4, 6.5, 6.5],  # avg 6.4
        study_hours=[2, 2, 2, 2, 2, 2, 2],  # 14 of 12: on track
    )
    brief = build_brief(days, settings("sleep", "study"), TODAY)
    assert "Sleep" in brief["sentences"][0]
    assert "6.4" in brief["sentences"][0]
    assert "7.5" in brief["sentences"][0]


def test_largest_relative_gap_wins():
    days = week(
        sleep_hours=[7] * 7,  # 7% behind
        study_hours=[1] * 7,  # 7 of 12: 42% behind
    )
    brief = build_brief(days, settings("sleep", "study"), TODAY)
    assert brief["sentences"][0].startswith("Study")


def test_spending_over_its_limit_is_behind():
    days = week(spend_pct_of_budget=[None, None, None, None, None, 90, 130], sleep_hours=[8] * 7)
    brief = build_brief(days, settings("sleep", "spending"), TODAY)
    assert brief["sentences"][0].startswith("Spending")
    assert "130" in brief["sentences"][0]


def test_nothing_behind_says_what_is_going_well():
    days = week(sleep_hours=[8] * 7)
    brief = build_brief(days, settings("sleep"), TODAY)
    assert "on track" in brief["sentences"][0].lower()
    assert "behind" not in brief["sentences"][0].lower()


# (b) gaps are excluded, never zero

def test_gaps_are_excluded_from_the_average():
    days = week(sleep_hours=[None, 6, None, 6, None, 6, None])
    brief = build_brief(days, settings("sleep"), TODAY)
    assert brief["facts"][0]["value"] == 6
    assert "6 h" in brief["sentences"][0]


def test_area_with_no_data_is_not_behind():
    days = week(sleep_hours=[7] * 7)  # study has no data at all
    brief = build_brief(days, settings("study", "sleep"), TODAY)
    assert brief["sentences"][0].startswith("Sleep")
    assert all(f["area_id"] != "study" for f in brief["facts"])


# (c) all-gap week

def test_all_gap_week_asks_for_first_log():
    brief = build_brief(week(), settings("sleep", "study"), TODAY)
    assert brief == {"sentences": [FIRST_BRIEF], "facts": []}


def test_no_days_at_all_asks_for_first_log():
    assert build_brief([], settings("sleep"), TODAY) == {"sentences": [FIRST_BRIEF], "facts": []}


# (d) safety line

def test_very_low_sleep_adds_doctor_sentence_without_medical_advice():
    days = week(sleep_hours=[4.5] * 7)
    brief = build_brief(days, settings("sleep"), TODAY)
    text = " ".join(brief["sentences"]).lower()
    assert "talk to a doctor" in text
    for word in ["diet", "dose", "medication"]:
        assert word not in text


def test_normal_low_sleep_has_no_doctor_sentence():
    days = week(sleep_hours=[6] * 7)
    text = " ".join(build_brief(days, settings("sleep"), TODAY)["sentences"]).lower()
    assert "doctor" not in text


def test_doctor_sentence_appears_even_when_another_area_is_further_behind():
    days = week(sleep_hours=[4.8] * 7, study_hours=[0.1] * 7)
    brief = build_brief(days, settings("sleep", "study"), TODAY)
    assert brief["sentences"][0].startswith("Study")
    assert any("talk to a doctor" in s for s in brief["sentences"])


# (e) disabled modules and dates outside the window

def test_disabled_modules_never_appear():
    days = week(sleep_hours=[8] * 7, study_hours=[0] * 7)  # study terrible but disabled
    brief = build_brief(days, settings("sleep"), TODAY)
    assert all("Study" not in s for s in brief["sentences"])
    assert {f["area_id"] for f in brief["facts"]} == {"sleep"}


def test_days_outside_the_window_are_ignored():
    old = normalize_day({"sleep_hours": 2}, "2026-10-14")
    future = normalize_day({"sleep_hours": 2}, "2026-10-22")
    days = [old, *week(sleep_hours=[8] * 7), future]
    brief = build_brief(days, settings("sleep"), TODAY)
    assert brief["facts"][0]["value"] == 8


# (f) sentence count, pattern and action

def test_three_to_four_sentences_when_data_exists():
    cases = [
        week(sleep_hours=[6] * 7),
        week(sleep_hours=[None] * 6 + [6]),
        week(sleep_hours=[4] * 7),
        week(sleep_hours=[8] * 7),
    ]
    for days in cases:
        assert 3 <= len(build_brief(days, settings("sleep"), TODAY)["sentences"]) <= 4


def test_pattern_names_the_weakest_day():
    # the window starts on 2026-10-15, a Thursday
    days = week(sleep_hours=[5.5, 7, 7, 7, 7, 7, 7])
    brief = build_brief(days, settings("sleep"), TODAY)
    assert brief["sentences"][1] == "Lowest was Thursday (5.5 h)."


def test_pattern_for_a_limit_names_the_highest_day():
    days = week(spend_pct_of_budget=[140, 100, 110, 120, 120, 120, 120])
    brief = build_brief(days, settings("spending"), TODAY)
    assert brief["sentences"][1] == "Highest was Thursday (140%)."


def test_fewer_than_four_points_has_no_weakest_day():
    days = week(sleep_hours=[None, None, None, None, 5, 6, 6])
    brief = build_brief(days, settings("sleep"), TODAY)
    assert "Lowest" not in brief["sentences"][1]
    assert brief["sentences"][1] == "Log Sleep on more days to see a pattern."


def test_action_is_the_areas_short_suggestion():
    days = week(sleep_hours=[6] * 7)
    brief = build_brief(days, settings("sleep"), TODAY)
    assert brief["sentences"][2] == AREAS[0].suggestion


# (g) every number shown is in facts

def test_every_number_in_the_sentences_is_in_facts():
    cases = [
        (week(sleep_hours=[6, 6.5, 6.5, 6.4, 6.4, 6.5, 6.5], study_hours=[2] * 7), ("sleep", "study")),
        (week(spend_pct_of_budget=[100, 140, 110, 120, 120, 120, 120]), ("spending",)),
        (week(steps=[7000, 7500, None, 8000, 6000, 6100, 7200]), ("steps",)),
        (week(sleep_hours=[4.5] * 7), ("sleep",)),
        (week(work_hours=[3] * 7), ("work",)),
    ]
    for days, modules in cases:
        brief = build_brief(days, settings(*modules), TODAY)
        known = {n for f in brief["facts"] for n in (f["value"], f["target"])}
        for sentence in measured_sentences(brief):
            for n in numbers_in(sentence):
                assert n in known, (sentence, brief["facts"])


def test_facts_list_every_enabled_area_with_data():
    days = week(sleep_hours=[8] * 7, study_hours=[2] * 7)
    brief = build_brief(days, settings("sleep", "study"), TODAY)
    summary = [f for f in brief["facts"] if "date" not in f]
    assert summary == [
        {"area_id": "sleep", "value": 8, "target": 7.5, "mode": "up"},
        {"area_id": "study", "value": 14, "target": 12, "mode": "up"},
    ]


def test_custom_targets_are_used():
    s = settings("sleep").model_copy()
    s.targets[0].target = 6
    brief = build_brief(week(sleep_hours=[6.5] * 7), s, TODAY)
    assert "on track" in brief["sentences"][0].lower()


# (h) plain hyphens only

def test_no_em_or_en_dashes():
    cases = [
        week(sleep_hours=[6] * 7),
        week(sleep_hours=[4] * 7),
        week(sleep_hours=[8] * 7),
        week(spend_pct_of_budget=[100, 140, 110, 120, 120, 120, 120]),
        week(),
    ]
    for days in cases:
        for module in ["sleep", "spending"]:
            text = " ".join(build_brief(days, settings(module), TODAY)["sentences"])
            assert "—" not in text and "–" not in text


# (i) bedtime line, for people with a sleep schedule

LATE_WEEK = ["22:30", "23:15", None, "22:50", "23:05", "22:40", "00:10"]  # 3 of 6 late; 22:50 is within 30 min


def with_schedule(*modules: str, bedtime: str = "22:30") -> Settings:
    s = settings(*modules)
    return check_settings(s.model_copy(update={"sleep_schedule": SleepSchedule(bedtime=bedtime, wake_time="06:30")}))


def nights(bedtimes: list[str | None], **series) -> list[dict]:
    """A week with these bedtimes, each night ending at 06:30."""
    wakes = [None if b is None else "06:30" for b in bedtimes]
    return week(bedtime=bedtimes, wake_time=wakes, **series)


def test_bedtime_line_counts_late_nights():
    brief = build_brief(nights(LATE_WEEK), with_schedule("sleep"), TODAY)
    assert "In bed after 22:30 on 3 of 6 nights." in brief["sentences"]


def test_bedtime_line_all_on_time():
    brief = build_brief(nights(["22:30", "22:45", "22:20", "23:00", None, "22:30", "22:35"]), with_schedule("sleep"), TODAY)
    assert "In bed by 22:30 on all 6 nights." in brief["sentences"]


def test_no_bedtime_line_under_four_nights():
    brief = build_brief(nights([None, None, None, None, "23:30", "23:30", "23:30"]), with_schedule("sleep"), TODAY)
    assert not any(s.startswith("In bed") for s in brief["sentences"])


def test_no_bedtime_line_without_schedule():
    brief = build_brief(nights(LATE_WEEK), settings("sleep"), TODAY)
    assert not any(s.startswith("In bed") for s in brief["sentences"])


def test_bedtime_line_replaces_pattern_when_sleep_is_focus():
    brief = build_brief(nights(LATE_WEEK), with_schedule("sleep"), TODAY)
    assert brief["sentences"][0].startswith("Sleep")
    assert brief["sentences"][1] == "In bed after 22:30 on 3 of 6 nights."
    assert not any("date" in f for f in brief["facts"])


def test_bedtime_line_after_action_when_other_area_is_focus():
    brief = build_brief(nights(LATE_WEEK, study_hours=[0.5] * 7), with_schedule("sleep", "study"), TODAY)
    assert brief["sentences"][0].startswith("Study")
    assert brief["sentences"][3] == "In bed after 22:30 on 3 of 6 nights."
    assert len(brief["sentences"]) == 4


def test_brief_never_exceeds_four_sentences():
    # Under 5 hours a night and study further behind: the low-sleep warning wins the last place.
    late = ["02:00"] * 7
    brief = build_brief(nights(late, study_hours=[0] * 7), with_schedule("sleep", "study"), TODAY)
    assert brief["sentences"][0].startswith("Study")
    assert len(brief["sentences"]) == 4
    assert brief["sentences"][-1] == LOW_SLEEP_LINE
    assert not any(f.get("kind") == "bedtime" for f in brief["facts"])


def test_bedtime_line_numbers_are_in_the_facts():
    brief = build_brief(nights(LATE_WEEK), with_schedule("sleep"), TODAY)
    fact = next(f for f in brief["facts"] if f.get("kind") == "bedtime")
    assert fact == {"area_id": "sleep", "kind": "bedtime", "value": 3, "nights": 6, "bedtime": "22:30"}

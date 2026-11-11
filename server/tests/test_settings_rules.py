import pytest
from pydantic import ValidationError

from app.models import Settings, SleepSchedule, Target
from app import settings_rules
from app.settings_rules import apply_onboarding, check_settings, select_modules, set_target


# --- select_modules ---

def test_no_modules_raises():
    with pytest.raises(ValueError):
        select_modules([])


def test_unknown_module_raises():
    with pytest.raises(ValueError):
        select_modules(["sleep", "moodle"])


def test_duplicates_collapse_and_order_is_kept():
    assert select_modules(["study", "sleep", "study", "sleep"]) == ["study", "sleep"]


def test_more_than_the_limit_raises(monkeypatch):
    # Only 3 areas exist now, so lower the limit to reach it.
    monkeypatch.setattr(settings_rules, "MAX_MODULES", 2)
    with pytest.raises(ValueError):
        select_modules(["sleep", "study", "work"])


def test_movement_is_no_longer_a_module():
    with pytest.raises(ValueError):
        select_modules(["sleep", "steps"])


def test_three_modules_is_allowed():
    ids = ["sleep", "study", "work"]
    assert select_modules(ids) == ids


def test_duplicates_do_not_count_towards_the_limit():
    ids = ["sleep", "work", "study", "sleep", "work"]
    assert len(select_modules(ids)) == 3


# --- apply_onboarding ---

def test_onboarding_creates_one_default_target_per_enabled_module():
    s = apply_onboarding(Settings(), ["sleep", "work", "study"])
    assert s.modules == ["sleep", "work", "study"]
    assert s.targets == [
        Target(area_id="sleep", target=7.5, mode="up"),
        Target(area_id="work", target=16, mode="up"),
        Target(area_id="study", target=12, mode="up"),
    ]


def test_picking_modules_does_not_finish_onboarding():
    # Onboarding has more steps after this one; it is marked done only at the end.
    assert apply_onboarding(Settings(), ["sleep"]).onboarded is False


def test_picking_modules_after_onboarding_keeps_it_finished():
    # Settings reuses this rule to change modules later.
    assert apply_onboarding(Settings(onboarded=True), ["sleep"]).onboarded is True


def test_onboarding_rejects_bad_selection():
    with pytest.raises(ValueError):
        apply_onboarding(Settings(), [])


def test_onboarding_keeps_other_settings():
    s = apply_onboarding(Settings(theme="dark"), ["sleep"])
    assert s.theme == "dark"


def test_onboarding_does_not_change_the_input():
    original = Settings()
    apply_onboarding(original, ["sleep"])
    assert original.onboarded is False
    assert original.targets == []


def test_reonboarding_keeps_custom_targets_for_modules_still_enabled():
    s = apply_onboarding(Settings(), ["sleep", "study"])
    s = set_target(s, "sleep", 8, "up")
    s = apply_onboarding(s, ["sleep", "work"])
    assert s.targets == [
        Target(area_id="sleep", target=8, mode="up"),
        Target(area_id="work", target=16, mode="up"),
    ]


# --- set_target ---

def test_set_target_changes_the_target():
    s = apply_onboarding(Settings(), ["sleep"])
    s = set_target(s, "sleep", 8, "up")
    assert s.targets == [Target(area_id="sleep", target=8, mode="up")]


def test_set_target_zero_raises():
    s = apply_onboarding(Settings(), ["sleep"])
    with pytest.raises(ValueError):
        set_target(s, "sleep", 0, "up")


def test_set_target_negative_raises():
    s = apply_onboarding(Settings(), ["sleep"])
    with pytest.raises(ValueError):
        set_target(s, "sleep", -1, "up")


def test_set_target_unknown_mode_raises():
    s = apply_onboarding(Settings(), ["sleep"])
    with pytest.raises(ValueError):
        set_target(s, "sleep", 8, "down")


def test_set_target_for_disabled_module_raises():
    s = apply_onboarding(Settings(), ["sleep"])
    with pytest.raises(ValueError):
        set_target(s, "study", 10, "up")


# --- sleep schedule: the times decide the sleep target ---

SCHEDULE = {"bedtime": "22:30", "wake_time": "06:30"}


def sleep_target(s: Settings) -> Target:
    return next(t for t in s.targets if t.area_id == "sleep")


def test_schedule_sets_sleep_target():
    s = apply_onboarding(Settings(), ["sleep", "study"])
    s = check_settings(s.model_copy(update={"sleep_schedule": SleepSchedule(**SCHEDULE)}))
    assert sleep_target(s) == Target(area_id="sleep", target=8, mode="up")
    assert Target(area_id="study", target=12, mode="up") in s.targets


def test_schedule_ignored_when_sleep_not_enabled():
    s = apply_onboarding(Settings(), ["study"])
    checked = check_settings(s.model_copy(update={"sleep_schedule": SleepSchedule(**SCHEDULE)}))
    assert checked.targets == s.targets


def test_apply_onboarding_keeps_schedule_target():
    s = Settings(modules=["study"], sleep_schedule=SleepSchedule(bedtime="23:00", wake_time="06:30"))
    s = apply_onboarding(s, ["sleep"])
    assert sleep_target(s).target == 7.5


def test_equal_schedule_times_rejected():
    with pytest.raises(ValidationError):
        Settings(sleep_schedule={"bedtime": "22:00", "wake_time": "22:00"})


def test_bad_schedule_time_rejected():
    with pytest.raises(ValidationError):
        Settings(sleep_schedule={"bedtime": "25:00", "wake_time": "06:30"})


def test_no_schedule_by_default():
    assert Settings().sleep_schedule is None


# --- target caps (the page has the same limits) ---

@pytest.mark.parametrize("area_id,target", [("sleep", 24.5), ("study", 169), ("work", 169)])
def test_target_above_its_cap_is_rejected(area_id, target):
    s = Settings(modules=[area_id], targets=[Target(area_id=area_id, target=target, mode="up")])
    with pytest.raises(ValueError):
        check_settings(s)


@pytest.mark.parametrize("area_id,target", [("sleep", 24), ("study", 168), ("work", 168)])
def test_target_at_its_cap_is_allowed(area_id, target):
    s = Settings(modules=[area_id], targets=[Target(area_id=area_id, target=target, mode="up")])
    assert check_settings(s).targets[0].target == target


def test_set_target_above_cap_is_rejected():
    s = Settings(modules=["sleep"])
    with pytest.raises(ValueError):
        set_target(s, "sleep", 30, "up")


# --- work profile: the schedule and kind decide the work target ---

WEEK = {"days": [0, 1, 2, 3, 4], "start": "09:00", "end": "17:00"}


def work_target(s: Settings) -> Target:
    return next(t for t in s.targets if t.area_id == "work")


def work_settings(modules=("work",), targets=(), **work) -> Settings:
    return Settings(modules=list(modules), targets=list(targets), work=work)


def test_work_schedule_sets_the_target():
    s = check_settings(work_settings(schedule=WEEK))
    assert work_target(s) == Target(area_id="work", target=40, mode="up")


@pytest.mark.parametrize("kind, mode", [
    ("employed", "limit"), ("freelance", "up"), ("student", "up"),
    ("job_hunting", "up"), ("other", "up"),
])
def test_kind_sets_the_mode(kind, mode):
    s = check_settings(work_settings(kind=kind, schedule=WEEK))
    assert work_target(s) == Target(area_id="work", target=40, mode=mode)


def test_no_kind_keeps_the_saved_mode():
    saved = Target(area_id="work", target=10, mode="limit")
    s = check_settings(work_settings(targets=[saved], schedule=WEEK))
    assert work_target(s) == Target(area_id="work", target=40, mode="limit")


def test_empty_profile_changes_nothing():
    s = work_settings(targets=[Target(area_id="work", target=25, mode="limit")])
    assert check_settings(s) == s


def test_work_unticked_leaves_the_target_alone():
    stale = Target(area_id="work", target=10, mode="up")
    s = work_settings(modules=("sleep",), targets=[stale], schedule=WEEK)
    assert Target(area_id="work", target=10, mode="up") in check_settings(s).targets


def test_ticking_work_again_resyncs():
    s = Settings(modules=["sleep"], work={"schedule": WEEK})
    s = apply_onboarding(s, ["work"])
    assert work_target(s).target == 40


def test_hours_vary_keeps_the_typed_target():
    s = work_settings(
        targets=[Target(area_id="work", target=25, mode="up")], kind="employed", hours_vary=True)
    assert work_target(check_settings(s)) == Target(area_id="work", target=25, mode="limit")


def test_employed_without_hours_defaults_to_40_limit():
    s = check_settings(work_settings(kind="employed"))
    assert work_target(s) == Target(area_id="work", target=40, mode="limit")


def test_employed_keeps_a_custom_saved_target():
    s = work_settings(targets=[Target(area_id="work", target=30, mode="up")], kind="employed")
    assert work_target(check_settings(s)) == Target(area_id="work", target=30, mode="limit")


def test_employed_schedule_hours_win():
    s = check_settings(work_settings(kind="employed", schedule=WEEK))
    assert work_target(s) == Target(area_id="work", target=40, mode="limit")
    short = {"days": [0, 1], "start": "09:00", "end": "13:00"}
    assert work_target(check_settings(work_settings(kind="employed", schedule=short))).target == 8


def test_employed_hours_vary_keeps_the_area_default():
    s = check_settings(work_settings(kind="employed", hours_vary=True))
    assert work_target(s) == Target(area_id="work", target=16, mode="limit")


def test_freelance_without_hours_stays_16_up():
    s = check_settings(work_settings(kind="freelance"))
    assert work_target(s) == Target(area_id="work", target=16, mode="up")

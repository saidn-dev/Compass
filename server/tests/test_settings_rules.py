import pytest
from pydantic import ValidationError

from app.models import Settings, SleepSchedule, Target
from app.settings_rules import apply_onboarding, check_settings, select_modules, set_target


# --- select_modules ---

def test_no_modules_raises():
    with pytest.raises(ValueError):
        select_modules([])


def test_six_modules_raises():
    with pytest.raises(ValueError):
        select_modules(["sleep", "steps", "study", "work", "spending", "fasting"])


def test_unknown_module_raises():
    with pytest.raises(ValueError):
        select_modules(["sleep", "moodle"])


def test_duplicates_collapse_and_order_is_kept():
    assert select_modules(["study", "sleep", "study", "sleep"]) == ["study", "sleep"]


def test_five_modules_is_allowed():
    ids = ["sleep", "steps", "study", "work", "spending"]
    assert select_modules(ids) == ids


def test_duplicates_do_not_count_towards_the_limit():
    ids = ["sleep", "steps", "study", "work", "spending", "sleep"]
    assert len(select_modules(ids)) == 5


# --- apply_onboarding ---

def test_onboarding_creates_one_default_target_per_enabled_module():
    s = apply_onboarding(Settings(), ["sleep", "spending", "study"])
    assert s.modules == ["sleep", "spending", "study"]
    assert s.targets == [
        Target(area_id="sleep", target=7.5, mode="up"),
        Target(area_id="spending", target=100, mode="limit"),
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
    s = apply_onboarding(Settings(), ["sleep", "steps"])
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

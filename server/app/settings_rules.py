"""Rules for onboarding and settings.

Which modules can be enabled (1-5), default targets, changing a target,
and keeping the sleep target in step with a sleep schedule.
"""
from app.areas import AREAS
from app.models import Settings, Target
from app.sleep import hours_between

MAX_MODULES = 5
AREAS_BY_ID = {a.id: a for a in AREAS}


def select_modules(ids: list[str]) -> list[str]:
    """Clean a module choice: no duplicates, order kept, 1-5 known ids."""
    chosen = list(dict.fromkeys(ids))
    unknown = [i for i in chosen if i not in AREAS_BY_ID]
    if unknown:
        raise ValueError(f"Unknown module: {unknown[0]}.")
    if not chosen:
        raise ValueError("Choose at least 1 module.")
    if len(chosen) > MAX_MODULES:
        raise ValueError(f"Choose up to {MAX_MODULES} modules.")
    return chosen


def target_for(s: Settings, area_id: str) -> Target:
    """The module's target from settings, or its default if none is set."""
    for t in s.targets:
        if t.area_id == area_id:
            return t
    area = AREAS_BY_ID[area_id]
    return Target(area_id=area_id, target=area.default_target, mode=area.default_mode)


def check_settings(s: Settings) -> Settings:
    """Settings as sent by the page: modules must be a valid choice, targets for known areas."""
    modules = select_modules(s.modules) if s.modules else []
    for t in s.targets:
        if t.area_id not in AREAS_BY_ID:
            raise ValueError(f"Unknown module: {t.area_id}.")
    return sync_sleep_target(s.model_copy(update={"modules": modules}))


def sync_sleep_target(s: Settings) -> Settings:
    """With a sleep schedule, the sleep target is the hours between its two times."""
    if s.sleep_schedule is None or "sleep" not in s.modules:
        return s
    hours = hours_between(s.sleep_schedule.bedtime, s.sleep_schedule.wake_time)
    new = Target(area_id="sleep", target=hours, mode="up")
    targets = [new if t.area_id == "sleep" else t for t in s.targets]
    if all(t.area_id != "sleep" for t in s.targets):
        targets.append(new)
    return s.model_copy(update={"targets": targets})


def apply_onboarding(s: Settings, ids: list[str]) -> Settings:
    """Enable the chosen modules with default targets (keeping custom ones).

    Does not mark onboarding as done: the page does that on its last step,
    so closing the tab halfway brings the user back to onboarding.
    """
    modules = select_modules(ids)
    existing = {t.area_id: t for t in s.targets}
    targets = [
        existing.get(i) or Target(
            area_id=i, target=AREAS_BY_ID[i].default_target, mode=AREAS_BY_ID[i].default_mode,
        )
        for i in modules
    ]
    return sync_sleep_target(s.model_copy(update={"modules": modules, "targets": targets}))


def set_target(s: Settings, area_id: str, target: float, mode: str) -> Settings:
    """Change one enabled module's target. Raises ValueError if target <= 0."""
    if area_id not in s.modules:
        raise ValueError(f"Module is not enabled: {area_id}.")
    if not target > 0:
        raise ValueError("Target must be more than 0.")
    if mode not in ("up", "limit"):
        raise ValueError(f"Unknown mode: {mode}.")
    new = Target(area_id=area_id, target=target, mode=mode)
    targets = [new if t.area_id == area_id else t for t in s.targets]
    if all(t.area_id != area_id for t in s.targets):
        targets.append(new)
    return s.model_copy(update={"targets": targets})

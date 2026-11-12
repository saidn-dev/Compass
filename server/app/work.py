"""Work rules: weekly hours from a schedule, the brief's tip, the card text."""
from app.models import WorkProfile, WorkSchedule
from app.sleep import hours_between

STOP_TIP = "Pick a time to stop work today and keep to it."
GENERAL_TIP = "Block 30 minutes {when} for your most urgent task."
DERAILER_TIPS = {
    "priorities": "Pick the one task that matters most this week and give it 30 minutes {when}.",
    "procrastination": "Spend 10 minutes {when} on the task you've been putting off.",
    "interruptions": "Turn off notifications for one 30-minute block {when}.",
    "energy": "Do 30 minutes on your hardest task {when}, then take a short break.",
    "projects": "Choose one project to move forward {when} and leave the rest for now.",
}
WHEN = {
    "morning": "in the morning",
    "afternoon": "in the afternoon",
    "evening": "in the evening",
    "varies": "today",
}
NO_FOCUS_WHEN = WHEN["varies"]

ALL_WORK_TIPS = [STOP_TIP] + [
    t.format(when=w) for t in (GENERAL_TIP, *DERAILER_TIPS.values()) for w in WHEN.values()
]


def week_hours(schedule: WorkSchedule) -> float:
    """Hours in a normal week: the days worked times the hours between start and end."""
    return round(len(schedule.days) * hours_between(schedule.start, schedule.end), 2)


def work_tip(profile: WorkProfile, mode: str) -> str:
    """The brief's Work tip: stop tip in limit mode, else the first derailer's tip."""
    if mode == "limit":
        return STOP_TIP
    # No focus time answered reads the same as "It varies".
    when = WHEN[profile.focus] if profile.focus else NO_FOCUS_WHEN
    for d in profile.derailers:
        if d in DERAILER_TIPS:
            return DERAILER_TIPS[d].format(when=when)
    return GENERAL_TIP.format(when=when)


def work_card(profile: WorkProfile) -> dict | None:
    """The line under the Work card: role and goal joined by a dot, or None."""
    parts = []
    if profile.role:
        parts.append(profile.role)
    if profile.goal:
        parts.append(f"Goal: {profile.goal}")
    return {"text": " · ".join(parts)} if parts else None

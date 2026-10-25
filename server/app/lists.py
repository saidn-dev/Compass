"""Rules for habits, focus tasks and goals.

Toggle a habit, add/toggle tasks (max 3 a day), add goals (max 3).
"""
from app.models import MAX_TASK_TEXT, MAX_TASKS, NUMERIC_FIELDS, Goal

MAX_GOALS = 3


def toggle_habit(day: dict, habit_id: str) -> dict:
    habits = {**day["habits"], habit_id: not day["habits"].get(habit_id, False)}
    return {**day, "habits": habits}


def is_logged(day: dict) -> bool:
    """True if anything at all was logged for the day."""
    return (
        any(day.get(f) is not None for f in NUMERIC_FIELDS)
        or bool(day.get("habits"))
        or bool(day.get("tasks"))
        or bool(day.get("note"))
    )


def habit_completion(days: list[dict], habits: list[dict]) -> float | None:
    """Percent of habit-days done, counting only days with any logging."""
    logged = [d for d in days if is_logged(d)]
    if not habits or not logged:
        return None
    done = sum(d["habits"].get(h["id"]) is True for d in logged for h in habits)
    return done / (len(logged) * len(habits)) * 100


def check_tasks(raw: dict) -> None:
    """Reject a day sent with more focus tasks than allowed (instead of dropping some)."""
    tasks = raw.get("tasks")
    if isinstance(tasks, list) and len(tasks) > MAX_TASKS:
        raise ValueError(f"You can have up to {MAX_TASKS} focus tasks a day.")


def add_task(day: dict, text: str) -> dict:
    text = text.strip()[:MAX_TASK_TEXT]
    if not text:
        raise ValueError("A task needs some text.")
    if len(day["tasks"]) >= MAX_TASKS:
        raise ValueError(f"You can have up to {MAX_TASKS} focus tasks a day.")
    return {**day, "tasks": [*day["tasks"], {"text": text, "done": False}]}


def toggle_task(day: dict, index: int) -> dict:
    if not 0 <= index < len(day["tasks"]):
        raise ValueError(f"No task number {index}.")
    tasks = [
        {**t, "done": not t["done"]} if i == index else t
        for i, t in enumerate(day["tasks"])
    ]
    return {**day, "tasks": tasks}


def add_goal(goals: list[Goal], goal: Goal) -> list[Goal]:
    """Add a goal (percent is clamped 0-100 by Goal). Raises ValueError on a 4th."""
    if len(goals) >= MAX_GOALS:
        raise ValueError(f"You can have up to {MAX_GOALS} active goals.")
    return [*goals, goal]

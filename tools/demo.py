"""A demo of Compass with 12 weeks of made-up data.

Run it from the repository folder, after `python start.py` has been run once
(that creates .venv):

    .venv\\Scripts\\python.exe tools\\demo.py        (Windows)
    .venv/bin/python tools/demo.py                  (macOS / Linux)

It writes demo.db (rebuilt on every run, so the data always ends today), serves it
on http://127.0.0.1:8770/ and opens the browser. Your own compass.db is never touched.

The made-up person is a student with a part-time job. The data is written so the
patterns have something to find: late caffeine goes with later bedtimes, less sleep,
less study and a lower mood; exercise goes with a better mood.
"""
import argparse
import random
import sys
import threading
import webbrowser
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from app.db import Repository  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    Goal, Habit, Settings, SleepSchedule, StudyGoal, Target, WorkProfile, WorkSchedule,
)
from app.settings_rules import check_settings  # noqa: E402

HOST = "127.0.0.1"
DEMO_DB = ROOT / "demo.db"
DAYS = 84

TASKS = [
    "Finish the networks assignment", "Revise trees and heaps", "Email the client the invoice",
    "Fix the nav bug on the client site", "Read chapter 6", "Book the exam slot",
    "Push the portfolio update", "Past paper: 2024", "Call the bank", "Plan next week's shifts",
]
NOTES = [
    "Good focus this morning. The library is quieter before 10.",
    "Client wants the booking form by Friday.",
    "Ask the lecturer about the networking assignment deadline.",
    "Slept badly, coffee at 6 pm was a mistake.",
    "Walk before breakfast made the whole day easier.",
]


def clock(minutes: int) -> str:
    """Minutes after midnight (may go past 24 h) as "HH:MM"."""
    minutes %= 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def demo_settings(today: date) -> Settings:
    return check_settings(Settings(
        onboarded=True,
        modules=["sleep", "study", "work"],
        targets=[Target(area_id="study", target=14, mode="up")],
        sleep_schedule=SleepSchedule(bedtime="23:00", wake_time="07:00"),
        study_goals=[
            StudyGoal(name="Networks assignment", date=(today + timedelta(days=4)).isoformat()),
            StudyGoal(name="Data Structures exam", date=(today + timedelta(days=12)).isoformat()),
            StudyGoal(name="Final year project"),
        ],
        work=WorkProfile(
            kind="student", role="Freelance web developer",
            schedule=WorkSchedule(days=[0, 2, 4, 5], start="17:00", end="20:00"),
            focus="evening", goal="Ship the client's booking site", derailers=["procrastination", "interruptions"],
        ),
        habits=[Habit(id="walk", name="Morning walk"), Habit(id="read", name="Read 20 minutes"),
                Habit(id="phone", name="No phone in bed")],
        goals=[
            Goal(name="Finish my degree", percent=72, detail="Two exams and the project left"),
            Goal(name="First three paying clients", percent=66, detail="Two signed, one in talks"),
            Goal(name="Run 5 km without stopping", percent=40),
        ],
    ))


def demo_day(day: date, back: int, rng: random.Random) -> dict | None:
    """One made-up day, `back` days before today. None is a day with nothing logged."""
    weekday = day.weekday()
    sick = 37 <= back <= 40           # a few days off, about five weeks ago
    if back in (18, 52, 53, 66):      # the odd day nobody logged
        return None

    caffeine = not sick and rng.random() < 0.28
    exercise = not sick and rng.random() < 0.4
    exam_week = 20 <= back <= 26
    social = weekday in (4, 5) and rng.random() < 0.5
    travel = back in (60, 61)

    bed = 23 * 60 + rng.randint(-25, 20)
    if caffeine:
        bed += rng.randint(50, 110)
    if social:
        bed += rng.randint(30, 80)
    wake = 7 * 60 + rng.randint(-10, 25) + (45 if weekday >= 5 else 0)
    slept = (wake + 24 * 60 - bed) % (24 * 60) / 60

    study = max(0.0, 2.2 + (slept - 7.5) * 0.9 + rng.uniform(-0.6, 0.6))
    if exam_week:
        study += 1.5
    if weekday == 6:
        study *= 0.5
    if exercise:
        study += 0.3
    work = round(rng.uniform(2.5, 3.5) * 4) / 4 if weekday in (0, 2, 4, 5) else None
    if work is not None and rng.random() < 0.15:
        work = None  # a shift that fell through

    mood = 3 + (1 if slept >= 7.5 else -1 if slept < 6.5 else 0) + (1 if exercise else 0) - (1 if caffeine else 0)
    mood = max(1, min(5, mood + rng.choice([0, 0, 0, 1, -1])))

    tags = [tag for tag, on in (("caffeine", caffeine), ("exercise", exercise), ("exam", exam_week),
                                ("sick", sick), ("travel", travel), ("social", social)) if on]
    entry = {
        "bedtime": clock(bed), "wake_time": clock(wake),
        "study_hours": round(study * 4) / 4, "work_hours": work,
        "mood": mood, "tags": tags, "rest": sick,
        "habits": {"walk": exercise or rng.random() < 0.35, "read": rng.random() < 0.6,
                   "phone": not caffeine and rng.random() < 0.7},
        "tasks": [{"text": text, "done": rng.random() < 0.7} for text in rng.sample(TASKS, rng.randint(1, 3))],
        "note": rng.choice(NOTES) if rng.random() < 0.3 else "",
    }
    if sick:
        entry.update(study_hours=None, work_hours=None, mood=2, tasks=[], bedtime=clock(22 * 60), wake_time=clock(8 * 60))
    if back == 0:
        # Today is only half filled in, as it would be in the morning.
        entry.update(study_hours=None, work_hours=None, tags=[], rest=False,
                     habits={"walk": True}, note="",
                     tasks=[{"text": "Revise trees and heaps", "done": False}])
    if back == 1:
        entry["tasks"] = [{"text": "Finish the networks assignment", "done": False},
                          {"text": "Email the client the invoice", "done": True},
                          {"text": "Read chapter 6", "done": False}]
    return entry


def build_demo(path: Path, today: date) -> None:
    """Write a fresh demo database ending on `today`."""
    for leftover in (path, path.with_name(path.name + "-journal")):
        if leftover.exists():
            leftover.unlink()
    repo = Repository(str(path))
    repo.put_settings(demo_settings(today))
    rng = random.Random(7)  # the same made-up person every time
    for back in range(DAYS - 1, -1, -1):
        day = today - timedelta(days=back)
        entry = demo_day(day, back, rng)
        if entry is not None:
            repo.put_day({**entry, "date": day.isoformat()})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Compass with made-up demo data.")
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    args = parser.parse_args()

    import uvicorn

    build_demo(DEMO_DB, date.today())
    url = f"http://{HOST}:{args.port}/"
    print(f"Compass demo (made-up data) at {url}  Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    uvicorn.run(create_app(str(DEMO_DB)), host=HOST, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()

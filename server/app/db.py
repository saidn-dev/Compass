"""Database layer: the only file that talks to SQLite.

Saves and loads days and settings, exports/imports a full backup, deletes all.
Every query uses ? placeholders, never string formatting.
"""
import json
import sqlite3
import threading
from datetime import date, timedelta

from pydantic import ValidationError

from app.models import Settings, normalize_day

SCHEMA_VERSION = 1

_TABLES = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
"""


class Repository:
    def __init__(self, path: str) -> None:
        # One shared connection (needed for ":memory:"), guarded by a lock
        # because FastAPI runs handlers on several threads.
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock, self._conn:
            self._conn.executescript(_TABLES)
            self._conn.execute(
                "INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)",
                (str(SCHEMA_VERSION),),
            )

    # --- days ---

    def get_day(self, date_key: str) -> dict:
        with self._lock:
            row = self._conn.execute("SELECT json FROM days WHERE date = ?", (date_key,)).fetchone()
        return self._load_day(row[0] if row else None, date_key)

    def put_day(self, day: dict) -> None:
        clean = normalize_day(day, day["date"])
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO days (date, json) VALUES (?, ?)",
                (clean["date"], json.dumps(clean)),
            )

    def days_between(self, start: str, end: str) -> list[dict]:
        """One Day per date from start to end inclusive, oldest first; unlogged dates are empty."""
        with self._lock:
            rows = dict(self._conn.execute(
                "SELECT date, json FROM days WHERE date BETWEEN ? AND ?", (start, end)
            ).fetchall())
        result = []
        current, last = date.fromisoformat(start), date.fromisoformat(end)
        while current <= last:
            key = current.isoformat()
            result.append(self._load_day(rows.get(key), key))
            current += timedelta(days=1)
        return result

    @staticmethod
    def _load_day(text: str | None, date_key: str) -> dict:
        try:
            raw = json.loads(text) if text else {}
        except json.JSONDecodeError:
            raw = {}
        return normalize_day(raw if isinstance(raw, dict) else {}, date_key)

    # --- settings ---

    def get_settings(self) -> Settings:
        with self._lock:
            row = self._conn.execute("SELECT json FROM settings WHERE id = 1").fetchone()
        if row is None:
            return Settings()
        try:
            return Settings.model_validate_json(row[0])
        except ValidationError:
            return Settings()

    def put_settings(self, settings: Settings) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO settings (id, json) VALUES (1, ?)",
                (settings.model_dump_json(),),
            )

    # --- backup ---

    def export_all(self) -> dict:
        with self._lock:
            rows = self._conn.execute("SELECT date, json FROM days ORDER BY date").fetchall()
        return {
            "schema": SCHEMA_VERSION,
            "settings": self.get_settings().model_dump(),
            "days": [self._load_day(text, key) for key, text in rows],
        }

    def import_all(self, data: dict) -> None:
        """Replace everything with a backup. Raises ValueError and changes nothing if it is invalid."""
        settings, days = self._validate_backup(data)
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM days")
            self._conn.executemany(
                "INSERT OR REPLACE INTO days (date, json) VALUES (?, ?)",
                [(d["date"], json.dumps(d)) for d in days],
            )
            self._conn.execute(
                "INSERT OR REPLACE INTO settings (id, json) VALUES (1, ?)",
                (settings.model_dump_json(),),
            )

    @staticmethod
    def _validate_backup(data: object) -> tuple[Settings, list[dict]]:
        if not isinstance(data, dict):
            raise ValueError("Backup must be a JSON object.")
        if data.get("schema") != SCHEMA_VERSION:
            raise ValueError(f"Backup schema must be {SCHEMA_VERSION}.")
        try:
            settings = Settings.model_validate(data.get("settings"))
        except ValidationError as e:
            raise ValueError(f"Backup settings are invalid: {e.error_count()} problem(s).") from None
        raw_days = data.get("days")
        if not isinstance(raw_days, list):
            raise ValueError("Backup days must be a list.")
        days = []
        for i, raw in enumerate(raw_days):
            if not isinstance(raw, dict) or not isinstance(raw.get("date"), str):
                raise ValueError(f"Backup day {i} has no date.")
            try:
                days.append(normalize_day(raw, raw["date"]))
            except ValueError:
                raise ValueError(f"Backup day {i} has a bad date: {raw['date']!r}.") from None
        return settings, days

    def delete_all(self) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM days")
            self._conn.execute("DELETE FROM settings")

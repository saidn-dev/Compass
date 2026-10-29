import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

HOST = {"Host": "127.0.0.1:8765"}
JSON = {**HOST, "Content-Type": "application/json"}


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(str(tmp_path / "compass.db")), base_url="http://127.0.0.1:8765")


def onboard(client, modules=("sleep", "study", "spending")) -> None:
    """Pick modules, then finish onboarding the way the page's last step does."""
    r = client.post("/api/onboarding", json={"modules": list(modules)}, headers=HOST)
    assert r.status_code == 200, r.text
    r = client.put("/api/settings", json={**r.json(), "onboarded": True}, headers=HOST)
    assert r.status_code == 200, r.text


def assert_error(r, status: int) -> None:
    assert r.status_code == status, r.text
    body = r.json()
    assert set(body) == {"error"}
    assert isinstance(body["error"]["code"], str)
    assert isinstance(body["error"]["message"], str)


# --- settings and onboarding ---

def test_fresh_app_is_not_onboarded(client):
    r = client.get("/api/settings", headers=HOST)
    assert r.status_code == 200
    assert r.json()["onboarded"] is False


def test_onboarding_with_six_modules_is_rejected(client):
    r = client.post("/api/onboarding", headers=HOST,
                    json={"modules": ["sleep", "steps", "study", "work", "spending", "fasting"]})
    assert_error(r, 422)
    assert client.get("/api/settings", headers=HOST).json()["onboarded"] is False


def test_onboarding_with_unknown_module_is_rejected(client):
    assert_error(client.post("/api/onboarding", json={"modules": ["moodle"]}, headers=HOST), 422)


def test_onboarding_without_modules_field_is_rejected(client):
    assert_error(client.post("/api/onboarding", json={}, headers=HOST), 422)


def test_onboarding_with_three_modules_updates_settings(client):
    onboard(client)
    s = client.get("/api/settings", headers=HOST).json()
    assert s["onboarded"] is True
    assert s["modules"] == ["sleep", "study", "spending"]
    assert [t["area_id"] for t in s["targets"]] == ["sleep", "study", "spending"]


def test_onboarding_alone_does_not_finish_onboarding(client):
    r = client.post("/api/onboarding", json={"modules": ["sleep"]}, headers=HOST)
    assert r.json()["onboarded"] is False
    assert client.get("/api/settings", headers=HOST).json()["onboarded"] is False
    client.put("/api/settings", json={**r.json(), "onboarded": True}, headers=HOST)
    assert client.get("/api/settings", headers=HOST).json()["onboarded"] is True


def test_put_settings_replaces_them(client):
    onboard(client)
    s = client.get("/api/settings", headers=HOST).json()
    s["theme"] = "dark"
    s["targets"][0]["target"] = 8
    r = client.put("/api/settings", json=s, headers=HOST)
    assert r.status_code == 200
    again = client.get("/api/settings", headers=HOST).json()
    assert again["theme"] == "dark"
    assert again["targets"][0]["target"] == 8


def test_put_settings_with_zero_target_is_rejected(client):
    onboard(client)
    s = client.get("/api/settings", headers=HOST).json()
    s["targets"][0]["target"] = 0
    assert_error(client.put("/api/settings", json=s, headers=HOST), 422)


def test_put_settings_with_schedule_round_trips(client):
    onboard(client)
    s = client.get("/api/settings", headers=HOST).json()
    s["sleep_schedule"] = {"bedtime": "22:30", "wake_time": "06:30"}
    assert client.put("/api/settings", json=s, headers=HOST).status_code == 200
    saved = client.get("/api/settings", headers=HOST).json()
    assert saved["sleep_schedule"] == {"bedtime": "22:30", "wake_time": "06:30"}
    assert next(t for t in saved["targets"] if t["area_id"] == "sleep")["target"] == 8


def test_put_settings_with_equal_times_is_rejected(client):
    onboard(client)
    s = client.get("/api/settings", headers=HOST).json()
    s["sleep_schedule"] = {"bedtime": "22:30", "wake_time": "22:30"}
    assert_error(client.put("/api/settings", json=s, headers=HOST), 422)


def test_put_settings_with_unknown_module_is_rejected(client):
    s = client.get("/api/settings", headers=HOST).json()
    s["modules"] = ["moodle"]
    assert_error(client.put("/api/settings", json=s, headers=HOST), 422)


# --- days ---

def test_unknown_day_is_empty(client):
    r = client.get("/api/days/2026-10-20", headers=HOST)
    assert r.status_code == 200
    day = r.json()
    assert day["date"] == "2026-10-20"
    assert day["sleep_hours"] is None and day["tasks"] == [] and day["note"] == ""


def test_blank_number_is_stored_as_null(client):
    r = client.put("/api/days/2026-10-20", json={"sleep_hours": "", "study_hours": 0}, headers=HOST)
    assert r.status_code == 200
    day = client.get("/api/days/2026-10-20", headers=HOST).json()
    assert day["sleep_hours"] is None
    assert day["study_hours"] == 0


def test_put_day_with_times_works_out_hours(client):
    client.put("/api/days/2026-10-20", json={"bedtime": "23:00", "wake_time": "06:30"}, headers=HOST)
    day = client.get("/api/days/2026-10-20", headers=HOST).json()
    assert day["sleep_hours"] == 7.5
    assert day["bedtime"] == "23:00" and day["wake_time"] == "06:30"


def test_goal_hours_win_when_times_cleared(client):
    client.put("/api/days/2026-10-20", json={"bedtime": "23:00", "wake_time": "06:30"}, headers=HOST)
    client.put("/api/days/2026-10-20", json={"sleep_hours": 6, "bedtime": None, "wake_time": None}, headers=HOST)
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] == 6


def test_partial_times_with_null_hours_is_a_gap(client):
    client.put("/api/days/2026-10-20", json={"sleep_hours": 7}, headers=HOST)
    client.put("/api/days/2026-10-20", json={"bedtime": "23:00", "wake_time": None, "sleep_hours": None}, headers=HOST)
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] is None


def test_put_day_uses_the_date_in_the_path(client):
    client.put("/api/days/2026-10-20", json={"date": "1999-01-01", "sleep_hours": 7}, headers=HOST)
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] == 7
    assert client.get("/api/days/1999-01-01", headers=HOST).json()["sleep_hours"] is None


def test_put_day_with_four_tasks_is_rejected(client):
    tasks = [{"text": t, "done": False} for t in "abcd"]
    assert_error(client.put("/api/days/2026-10-20", json={"tasks": tasks}, headers=HOST), 422)
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["tasks"] == []


def test_bad_date_is_rejected(client):
    assert_error(client.get("/api/days/2026-13-01", headers=HOST), 422)
    assert_error(client.put("/api/days/20261020", json={}, headers=HOST), 422)


def test_put_day_with_non_object_body_is_rejected(client):
    assert_error(client.put("/api/days/2026-10-20", json=[1, 2], headers=HOST), 422)


# --- bulk ---

def test_bulk_merges_numbers_and_keeps_everything_else(client):
    client.put("/api/days/2026-10-20", headers=HOST, json={
        "sleep_hours": 7, "note": "keep me", "habits": {"read": True},
        "tasks": [{"text": "keep", "done": True}],
    })
    r = client.post("/api/days/bulk", headers=HOST, json={"days": [
        {"date": "2026-10-20", "steps": 9000, "note": "overwrite?", "tasks": [], "habits": {}},
        {"date": "2026-10-21", "fasting_hours": 16},
    ]})
    assert r.status_code == 200
    assert r.json() == {"saved": 2, "skipped": []}
    day = client.get("/api/days/2026-10-20", headers=HOST).json()
    assert day["steps"] == 9000
    assert day["sleep_hours"] == 7
    assert day["note"] == "keep me"
    assert day["habits"] == {"read": True}
    assert day["tasks"] == [{"text": "keep", "done": True}]
    assert client.get("/api/days/2026-10-21", headers=HOST).json()["fasting_hours"] == 16


def test_bulk_reports_bad_dates_and_values(client):
    r = client.post("/api/days/bulk", headers=HOST, json={"days": [
        {"date": "not-a-date", "steps": 100},
        {"date": "2026-10-20", "steps": "abc"},
        {"date": "2026-10-21", "steps": None},
        {"date": "2026-10-22"},
        "junk",
        {"date": "2026-10-23", "steps": 5000},
    ]})
    assert r.status_code == 200
    body = r.json()
    assert body["saved"] == 1
    assert [s["date"] for s in body["skipped"]] == ["not-a-date", "2026-10-20", "2026-10-21", "2026-10-22", None]
    assert all(isinstance(s["reason"], str) and s["reason"] for s in body["skipped"])
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["steps"] is None


def test_bulk_sleep_hours_skip_days_with_bed_and_wake_times(client):
    # Those days' hours come from their times, so imported hours would be silently replaced.
    client.put("/api/days/2026-10-20", json={"bedtime": "23:00", "wake_time": "06:30"}, headers=HOST)
    r = client.post("/api/days/bulk", headers=HOST, json={"days": [
        {"date": "2026-10-20", "sleep_hours": 6},
        {"date": "2026-10-21", "sleep_hours": 6},
    ]})
    assert r.json()["saved"] == 1
    assert [s["date"] for s in r.json()["skipped"]] == ["2026-10-20"]
    assert "bed and wake times" in r.json()["skipped"][0]["reason"]
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] == 7.5
    assert client.get("/api/days/2026-10-21", headers=HOST).json()["sleep_hours"] == 6


def test_bulk_never_writes_a_zero_for_a_bad_value(client):
    client.put("/api/days/2026-10-20", json={"steps": 4000}, headers=HOST)
    client.post("/api/days/bulk", headers=HOST, json={"days": [{"date": "2026-10-20", "steps": ""}]})
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["steps"] == 4000


def test_bulk_without_days_list_is_rejected(client):
    assert_error(client.post("/api/days/bulk", json={"days": "nope"}, headers=HOST), 422)


# --- dashboard ---

def test_dashboard_has_brief_and_one_card_per_enabled_area(client):
    onboard(client)
    for d, hours in [("2026-10-19", 6), ("2026-10-20", 6.5), ("2026-10-21", 6.7)]:
        client.put(f"/api/days/{d}", json={"sleep_hours": hours, "habits": {"read": True}}, headers=HOST)
    r = client.get("/api/dashboard?date=2026-10-21", headers=HOST)
    assert r.status_code == 200
    body = r.json()
    assert body["brief"]["sentences"][0].startswith("Sleep")
    assert body["brief"]["facts"]
    assert [a["id"] for a in body["areas"]] == ["sleep", "study", "spending"]
    by_id = {a["id"]: a for a in body["areas"]}
    assert by_id["sleep"]["status"] == "Behind"
    assert by_id["sleep"]["value"] == 6.4
    assert by_id["sleep"]["target"] == 7.5
    assert by_id["sleep"]["series"] == [None, None, None, None, 6, 6.5, 6.7]
    assert by_id["sleep"]["trend"] in ("up", "down", "flat", "none")
    assert by_id["study"]["status"] == "No data"
    assert by_id["study"]["value"] is None and by_id["study"]["progress"] is None
    for area in body["areas"]:
        assert area["status"] in ("On track", "Behind", "No data")
        assert {"label", "unit", "mode", "progress"} <= set(area)


def test_dashboard_habits_grid_and_completion(client):
    s = client.get("/api/settings", headers=HOST).json()
    s["habits"] = [{"id": "read", "name": "Read"}]
    client.put("/api/settings", json=s, headers=HOST)
    onboard(client, ["sleep"])
    client.put("/api/days/2026-10-20", json={"habits": {"read": True}}, headers=HOST)
    client.put("/api/days/2026-10-21", json={"sleep_hours": 7}, headers=HOST)
    habits = client.get("/api/dashboard?date=2026-10-21", headers=HOST).json()["habits"]
    assert habits["completion"] == 50.0
    row = habits["grid"][0]
    assert row["id"] == "read" and row["name"] == "Read"
    assert [c["date"] for c in row["days"]][-2:] == ["2026-10-20", "2026-10-21"]
    assert [c["done"] for c in row["days"]] == [None, None, None, None, None, True, False]


def test_dashboard_with_all_gaps_asks_for_first_log(client):
    onboard(client)
    brief = client.get("/api/dashboard?date=2026-10-21", headers=HOST).json()["brief"]
    assert brief == {"sentences": ["Log today's numbers to get your first brief."], "facts": []}


def test_dashboard_defaults_to_today(client):
    onboard(client)
    assert client.get("/api/dashboard", headers=HOST).status_code == 200


def test_dashboard_bad_date_is_rejected(client):
    assert_error(client.get("/api/dashboard?date=tomorrow", headers=HOST), 422)


# --- export / import ---

def test_export_then_import_round_trips(client, tmp_path):
    onboard(client)
    client.put("/api/days/2026-10-20", json={"sleep_hours": 7, "note": "'; DROP TABLE days;--"}, headers=HOST)
    backup = client.get("/api/export", headers=HOST).json()

    other = TestClient(create_app(str(tmp_path / "other.db")), base_url="http://127.0.0.1:8765")
    r = other.post("/api/import", content=json.dumps(backup), headers=JSON)
    assert r.status_code == 200
    assert other.get("/api/export", headers=HOST).json() == backup


def test_import_of_backup_without_sleep_times_still_works(client):
    # Backups made before the sleep schedule existed have no times at all.
    onboard(client)
    client.put("/api/days/2026-10-20", json={"sleep_hours": 7}, headers=HOST)
    backup = client.get("/api/export", headers=HOST).json()
    del backup["settings"]["sleep_schedule"]
    for day in backup["days"]:
        del day["bedtime"], day["wake_time"]
    r = client.post("/api/import", content=json.dumps(backup), headers=JSON)
    assert r.status_code == 200
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] == 7


def test_import_over_two_megabytes_is_rejected_and_data_kept(client):
    onboard(client)
    before = client.get("/api/export", headers=HOST).json()
    big = json.dumps({"schema": 1, "settings": {}, "days": [], "pad": "x" * (3 * 1024 * 1024)})
    assert_error(client.post("/api/import", content=big, headers=JSON), 413)
    assert client.get("/api/export", headers=HOST).json() == before


def test_import_of_bad_json_is_rejected_and_data_kept(client):
    onboard(client)
    before = client.get("/api/export", headers=HOST).json()
    assert_error(client.post("/api/import", content="{not json", headers=JSON), 400)
    assert client.get("/api/export", headers=HOST).json() == before


def test_import_with_wrong_schema_is_rejected_and_data_kept(client):
    onboard(client)
    before = client.get("/api/export", headers=HOST).json()
    bad = {**before, "schema": 99}
    assert_error(client.post("/api/import", content=json.dumps(bad), headers=JSON), 422)
    assert client.get("/api/export", headers=HOST).json() == before


def test_import_of_wrong_types_is_rejected_and_data_kept(client):
    onboard(client)
    before = client.get("/api/export", headers=HOST).json()
    for bad in ["[]", '"text"', json.dumps({**before, "days": "nope"})]:
        assert_error(client.post("/api/import", content=bad, headers=JSON), 422)
    assert client.get("/api/export", headers=HOST).json() == before


# --- sleep suggestion ---

def test_sleep_suggestion_with_everything_skipped(client):
    r = client.post("/api/sleep/suggestion", json={}, headers=HOST)
    assert r.status_code == 200
    assert r.json()["hours"] == 8 and r.json()["bedtime"] is None


def test_sleep_suggestion_with_answers(client):
    answers = {"age": "18_25", "role": "student", "habits": ["alcohol"], "wake_time": "06:30"}
    body = client.post("/api/sleep/suggestion", json=answers, headers=HOST).json()
    assert body["bedtime"] == "22:30" and len(body["tips"]) == 1


@pytest.mark.parametrize("answers", [{"age": "40"}, {"role": "pilot"}, {"habits": ["coffee"]}, {"wake_time": "6am"}])
def test_sleep_suggestion_rejects_unknown_answers(client, answers):
    assert_error(client.post("/api/sleep/suggestion", json=answers, headers=HOST), 422)


def test_sleep_suggestion_saves_nothing(client):
    onboard(client)
    before = client.get("/api/export", headers=HOST).json()
    client.post("/api/sleep/suggestion", json={"age": "65_plus", "wake_time": "05:00"}, headers=HOST)
    assert client.get("/api/export", headers=HOST).json() == before


# --- delete ---

def test_delete_without_confirm_header_is_refused(client):
    onboard(client)
    assert_error(client.delete("/api/data", headers=HOST), 400)
    assert_error(client.delete("/api/data", headers={**HOST, "X-Confirm": "yes"}), 400)
    assert client.get("/api/settings", headers=HOST).json()["onboarded"] is True


def test_delete_with_confirm_header_removes_everything(client):
    onboard(client)
    client.put("/api/days/2026-10-20", json={"sleep_hours": 7}, headers=HOST)
    r = client.delete("/api/data", headers={**HOST, "X-Confirm": "delete-all"})
    assert r.status_code == 200
    assert client.get("/api/settings", headers=HOST).json()["onboarded"] is False
    assert client.get("/api/days/2026-10-20", headers=HOST).json()["sleep_hours"] is None


# --- general ---

def test_unknown_route_uses_error_shape(client):
    assert_error(client.get("/api/nope", headers=HOST), 404)


def test_api_docs_stay_available(client):
    assert client.get("/docs", headers=HOST).status_code == 200


# --- web page and module list ---

def test_areas_lists_every_module_with_defaults(client):
    r = client.get("/api/areas", headers=HOST)
    assert r.status_code == 200
    areas = r.json()
    assert [a["id"] for a in areas] == ["sleep", "steps", "study", "work", "spending", "fasting"]
    sleep = areas[0]
    assert sleep == {"id": "sleep", "label": "Sleep", "unit": "h", "default_target": 7.5, "default_mode": "up"}


def test_home_page_is_served(client):
    r = client.get("/", headers=HOST)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "<title>Compass</title>" in r.text


def test_page_files_are_served(client):
    assert client.get("/styles.css", headers=HOST).status_code == 200
    assert client.get("/js/app.js", headers=HOST).status_code == 200


def test_page_is_protected_by_host_check(client):
    assert client.get("/", headers={"Host": "evil.com"}).status_code == 403


def test_missing_page_file_uses_error_shape(client):
    assert_error(client.get("/nope.html", headers=HOST), 404)

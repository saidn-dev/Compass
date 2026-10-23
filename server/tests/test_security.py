from fastapi.testclient import TestClient

from app.main import create_app

GOOD_HOST = {"Host": "127.0.0.1:8765"}


def make_client() -> TestClient:
    return TestClient(create_app(":memory:"), base_url="http://127.0.0.1:8765")


def test_health_with_local_host_is_ok():
    r = make_client().get("/health", headers=GOOD_HOST)
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_localhost_host_is_ok():
    r = make_client().get("/health", headers={"Host": "localhost:8765"})
    assert r.status_code == 200


def test_foreign_host_is_rejected():
    r = make_client().get("/health", headers={"Host": "evil.com"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden_host"


def test_foreign_origin_is_rejected():
    r = make_client().get("/health", headers={**GOOD_HOST, "Origin": "https://evil.com"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden_origin"


def test_same_origin_is_ok():
    r = make_client().get("/health", headers={**GOOD_HOST, "Origin": "http://127.0.0.1:8765"})
    assert r.status_code == 200


def test_write_without_json_content_type_is_rejected():
    r = make_client().post(
        "/api/settings", content="x", headers={**GOOD_HOST, "Content-Type": "text/plain"}
    )
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_media_type"


def test_bodyless_delete_is_not_blocked_by_content_type():
    r = make_client().delete("/api/data", headers=GOOD_HOST)
    assert r.status_code != 415


def test_no_cors_headers_on_any_response():
    c = make_client()
    for headers in (GOOD_HOST, {"Host": "evil.com"}, {**GOOD_HOST, "Origin": "https://evil.com"}):
        r = c.get("/health", headers=headers)
        assert "access-control-allow-origin" not in r.headers

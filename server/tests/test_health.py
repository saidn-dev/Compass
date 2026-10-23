from fastapi.testclient import TestClient

from app.main import create_app


def test_health():
    client = TestClient(create_app(":memory:"))
    assert client.get("/health").json() == {"status": "ok"}

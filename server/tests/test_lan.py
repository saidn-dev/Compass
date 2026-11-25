"""Home Wi-Fi access (start.py --lan): the passcode, the sign-in cookie and the Host rule."""
import pytest
from fastapi.testclient import TestClient

from app.lan import COOKIE, MAX_TRIES, LanConfig, save_passcode
from app.main import create_app

PHONE = ("192.168.100.40", 50000)
LAN_HOST = {"Host": "192.168.100.188:8765"}
PASSCODE = "river-lamp-42"


@pytest.fixture
def lan_file(tmp_path):
    path = tmp_path / "compass-lan.json"
    save_passcode(path, PASSCODE)
    return path


def phone(lan_file, **kw) -> TestClient:
    return TestClient(create_app(":memory:", lan_config=lan_file), base_url="http://192.168.100.188:8765",
                      client=PHONE, follow_redirects=False, **kw)


def sign_in(client: TestClient, passcode: str = PASSCODE):
    return client.post("/api/login", json={"passcode": passcode}, headers=LAN_HOST)


def test_short_passcode_is_refused(tmp_path):
    with pytest.raises(ValueError):
        save_passcode(tmp_path / "x.json", "12345")


def test_passcode_file_holds_no_plain_passcode(lan_file):
    assert PASSCODE not in lan_file.read_text()
    assert oct(lan_file.stat().st_mode & 0o777) == "0o600"


def test_phone_without_sign_in_gets_the_sign_in_page(lan_file):
    r = phone(lan_file).get("/", headers=LAN_HOST)
    assert r.status_code == 303
    assert r.headers["location"] == "/login.html"


def test_phone_without_sign_in_cannot_read_the_api(lan_file):
    r = phone(lan_file).get("/api/settings", headers=LAN_HOST)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "signed_out"


def test_sign_in_page_and_its_files_are_open(lan_file):
    c = phone(lan_file)
    for path in ("/login.html", "/styles.css", "/js/login.js", "/manifest.webmanifest", "/icons/icon-192.png"):
        assert c.get(path, headers=LAN_HOST).status_code == 200, path


def test_wrong_passcode_is_refused(lan_file):
    r = sign_in(phone(lan_file), "nope-nope")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "wrong_passcode"


def test_right_passcode_lets_the_phone_in(lan_file):
    c = phone(lan_file)
    r = sign_in(c)
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie
    assert c.get("/api/settings", headers=LAN_HOST).status_code == 200


def test_forged_cookie_is_refused(lan_file):
    c = phone(lan_file, cookies={COOKIE: "9999999999.forged"})
    assert c.get("/api/settings", headers=LAN_HOST).status_code == 401


def test_expired_cookie_is_refused(lan_file):
    config = LanConfig(lan_file)
    old = config.token(now=1_000_000)
    assert config.valid(old, now=1_000_000 + 1)
    assert not config.valid(old, now=1_000_000 + 91 * 86400)


def test_new_passcode_signs_every_phone_out(lan_file):
    token = LanConfig(lan_file).token()
    save_passcode(lan_file, "another-passcode")
    assert not LanConfig(lan_file).valid(token)


def test_too_many_wrong_passcodes_pause_sign_in(lan_file):
    c = phone(lan_file)
    for _ in range(MAX_TRIES):
        sign_in(c, "wrong-guess")
    r = sign_in(c)  # even the right one waits out the pause
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "paused"


def test_the_laptop_itself_needs_no_passcode(lan_file):
    c = TestClient(create_app(":memory:", lan_config=lan_file), base_url="http://127.0.0.1:8765",
                   client=("127.0.0.1", 50000))
    assert c.get("/api/settings", headers={"Host": "127.0.0.1:8765"}).status_code == 200


def test_names_other_than_localhost_are_still_refused_with_lan(lan_file):
    r = phone(lan_file).get("/login.html", headers={"Host": "evil.com"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden_host"


def test_public_ip_host_is_refused_with_lan(lan_file):
    r = phone(lan_file).get("/login.html", headers={"Host": "8.8.8.8:8765"})
    assert r.status_code == 403


def test_home_network_host_is_refused_without_lan():
    c = TestClient(create_app(":memory:"), base_url="http://192.168.100.188:8765")
    assert c.get("/health", headers=LAN_HOST).status_code == 403


def test_without_lan_there_is_no_login_route():
    c = TestClient(create_app(":memory:"), base_url="http://127.0.0.1:8765")
    r = c.post("/api/login", json={"passcode": PASSCODE}, headers={"Host": "127.0.0.1:8765"})
    assert r.status_code in (404, 405)

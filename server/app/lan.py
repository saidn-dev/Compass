"""Home Wi-Fi access: a passcode for phones on the same network.

Started with `python start.py --lan`. The laptop itself (loopback) never needs the
passcode. Any other device gets a sign-in page, and after the right passcode a
signed cookie that lasts LOGIN_DAYS. The passcode is kept only as a scrypt hash in
compass-lan.json (git-ignored), with the secret that signs the cookies; setting a
new passcode makes a new secret, which signs every device out.
"""
import hashlib
import hmac
import json
import secrets
import time
from http.cookies import SimpleCookie
from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse, RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.security import error_response

COOKIE = "compass_session"
LOGIN_DAYS = 90
MIN_PASSCODE = 6
MAX_TRIES = 5          # wrong passcodes in a row before a pause
PAUSE_SECONDS = 60     # doubles with each further wrong passcode
LOOPBACK = {"127.0.0.1", "::1"}
# What the sign-in page needs before anyone has signed in.
OPEN_PATHS = {"/login.html", "/api/login", "/styles.css", "/manifest.webmanifest", "/js/login.js"}
OPEN_PREFIXES = ("/icons/",)


def _hash(passcode: str, salt: bytes) -> bytes:
    return hashlib.scrypt(passcode.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)


def save_passcode(path: Path, passcode: str) -> None:
    if len(passcode) < MIN_PASSCODE:
        raise ValueError(f"The passcode needs at least {MIN_PASSCODE} characters.")
    salt = secrets.token_bytes(16)
    data = {"salt": salt.hex(), "hash": _hash(passcode, salt).hex(), "secret": secrets.token_hex(32)}
    path.write_text(json.dumps(data), encoding="utf-8")
    path.chmod(0o600)


class LanConfig:
    """The stored passcode hash and cookie secret, plus the wrong-try counters."""

    def __init__(self, path: Path) -> None:
        data = json.loads(path.read_text(encoding="utf-8"))
        self.salt = bytes.fromhex(data["salt"])
        self.hash = bytes.fromhex(data["hash"])
        self.secret = bytes.fromhex(data["secret"])
        self.fails: dict[str, tuple[int, float]] = {}  # ip -> (wrong tries, paused until)

    def check(self, passcode: str) -> bool:
        return hmac.compare_digest(_hash(passcode, self.salt), self.hash)

    def token(self, now: float | None = None) -> str:
        expiry = str(int((now or time.time()) + LOGIN_DAYS * 86400))
        return f"{expiry}.{self._sign(expiry)}"

    def valid(self, token: str, now: float | None = None) -> bool:
        expiry, _, signature = token.partition(".")
        if not expiry.isdigit() or not hmac.compare_digest(signature, self._sign(expiry)):
            return False
        return int(expiry) > (now or time.time())

    def _sign(self, text: str) -> str:
        return hmac.new(self.secret, text.encode(), hashlib.sha256).hexdigest()

    def paused_for(self, ip: str, now: float) -> int:
        _, until = self.fails.get(ip, (0, 0.0))
        return max(0, int(until - now + 0.999))

    def record(self, ip: str, ok: bool, now: float) -> None:
        if ok:
            self.fails.pop(ip, None)
            return
        tries, _ = self.fails.get(ip, (0, 0.0))
        tries += 1
        until = now + PAUSE_SECONDS * 2 ** (tries - MAX_TRIES) if tries >= MAX_TRIES else 0.0
        self.fails[ip] = (tries, until)


def _cookie(scope: Scope) -> str:
    for key, value in scope["headers"]:
        if key == b"cookie":
            jar = SimpleCookie()
            jar.load(value.decode("latin-1"))
            if COOKIE in jar:
                return jar[COOKIE].value
    return ""


class LanAuthMiddleware:
    """Lets the laptop through, and other devices only with a valid sign-in cookie."""

    def __init__(self, app: ASGIApp, config: LanConfig) -> None:
        self.app = app
        self.config = config

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self._allowed(scope):
            await self.app(scope, receive, send)
            return
        if scope["path"].startswith("/api/") or scope["method"] != "GET":
            response = error_response(401, "signed_out", "Sign in with your Compass passcode.")
        else:
            response = RedirectResponse("/login.html", status_code=303)
        await response(scope, receive, send)

    def _allowed(self, scope: Scope) -> bool:
        client = scope.get("client")
        if client and client[0] in LOOPBACK:
            return True
        path = scope["path"]
        if path in OPEN_PATHS or path.startswith(OPEN_PREFIXES):
            return True
        return self.config.valid(_cookie(scope))


class Login(BaseModel):
    passcode: str = Field(max_length=200)


def login_router(config: LanConfig) -> APIRouter:
    router = APIRouter()

    @router.post("/api/login")
    def login(body: Login, request: Request):
        ip = request.client.host if request.client else ""
        now = time.time()
        wait = config.paused_for(ip, now)
        if wait:
            return error_response(429, "paused", f"Too many wrong passcodes. Try again in {wait} seconds.")
        ok = config.check(body.passcode)
        config.record(ip, ok, now)
        if not ok:
            return error_response(401, "wrong_passcode", "That passcode isn't right.")
        response = JSONResponse({"ok": True})
        response.set_cookie(COOKIE, config.token(now), max_age=LOGIN_DAYS * 86400,
                            httponly=True, samesite="strict", path="/")
        return response

    return router

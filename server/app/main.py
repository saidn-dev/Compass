"""Entry point of the server: builds the app and wires everything together."""
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app.db import Repository
from app.lan import LanAuthMiddleware, LanConfig, login_router
from app.routes import ApiError, router
from app.security import HostOriginMiddleware, error_response

WEB_DIR = Path(__file__).resolve().parents[2] / "web"
HTTP_CODES = {400: "bad_request", 404: "not_found", 405: "method_not_allowed", 413: "too_large"}


def _install_error_handlers(app: FastAPI) -> None:
    """Every error leaves as {"error": {"code", "message"}}, never a stack trace."""

    @app.exception_handler(ApiError)
    async def api_error(_: Request, e: ApiError):
        return error_response(e.status, e.code, e.message)

    @app.exception_handler(ValueError)
    async def value_error(_: Request, e: ValueError):
        return error_response(422, "invalid", str(e))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, e: RequestValidationError):
        first = e.errors()[0]
        where = ".".join(str(p) for p in first["loc"] if p != "body")
        # Our own ValueErrors come back as "Value error, <our message>": show just ours.
        message = first["msg"].removeprefix("Value error, ")
        return error_response(422, "invalid", f"{where}: {message}" if where else message)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, e: HTTPException):
        return error_response(e.status_code, HTTP_CODES.get(e.status_code, "error"), str(e.detail))

    @app.exception_handler(Exception)
    async def unexpected(_: Request, e: Exception):
        return error_response(500, "server_error", "Something went wrong on the server.")


def create_app(db_path: str = "compass.db", lan_config: Path | None = None) -> FastAPI:
    """lan_config: the passcode file, to let phones on the home Wi-Fi in (start.py --lan)."""
    app = FastAPI(title="Compass")
    config = LanConfig(lan_config) if lan_config else None
    if config:
        app.add_middleware(LanAuthMiddleware, config=config)
    # Added last, so it runs first: a bad Host or Origin never reaches the sign-in check.
    app.add_middleware(HostOriginMiddleware, lan=config is not None)
    app.state.repo = Repository(db_path)
    _install_error_handlers(app)
    if config:
        app.include_router(login_router(config))

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(router)
    # The web page. Mounted last so /api and /health win.
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app(lan_config=Path(os.environ["COMPASS_LAN"]) if os.environ.get("COMPASS_LAN") else None)

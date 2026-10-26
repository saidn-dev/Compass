"""Entry point of the server: builds the app and wires everything together."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.db import Repository
from app.routes import ApiError, router
from app.security import HostOriginMiddleware, error_response

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
        return error_response(422, "invalid", f"{where}: {first['msg']}" if where else first["msg"])

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, e: HTTPException):
        return error_response(e.status_code, HTTP_CODES.get(e.status_code, "error"), str(e.detail))

    @app.exception_handler(Exception)
    async def unexpected(_: Request, e: Exception):
        return error_response(500, "server_error", "Something went wrong on the server.")


def create_app(db_path: str = "compass.db") -> FastAPI:
    app = FastAPI(title="Compass")
    app.add_middleware(HostOriginMiddleware)
    app.state.repo = Repository(db_path)
    _install_error_handlers(app)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(router)
    # Later: serve the web/ folder as static files.
    return app


app = create_app()

"""Security guard: refuses requests that did not come from Compass itself.

Rejects a wrong Host header, a foreign Origin, and writes that are not JSON,
so other websites in your browser cannot talk to the local API.
"""
from urllib.parse import urlsplit

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

LOCAL_HOSTS = {"127.0.0.1", "localhost"}
WRITE_METHODS = {"POST", "PUT", "DELETE"}


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


class HostOriginMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        problem = self._check(scope["method"], headers)
        if problem is not None:
            await problem(scope, receive, send)
            return
        await self.app(scope, receive, send)

    @staticmethod
    def _check(method: str, headers: dict[str, str]) -> JSONResponse | None:
        host = headers.get("host", "")
        if urlsplit("//" + host).hostname not in LOCAL_HOSTS:
            return _error(403, "forbidden_host", "Requests must go to 127.0.0.1 or localhost.")

        origin = headers.get("origin")
        if origin is not None and urlsplit(origin).netloc != host:
            return _error(403, "forbidden_origin", "Requests from other sites are not allowed.")

        if method in WRITE_METHODS:
            has_body = headers.get("content-length", "0") != "0" or "transfer-encoding" in headers
            content_type = headers.get("content-type", "").split(";")[0].strip().lower()
            if has_body and content_type != "application/json":
                return _error(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.")
        return None

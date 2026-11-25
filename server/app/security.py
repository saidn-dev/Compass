"""Security guard: refuses requests that did not come from Compass itself.

Rejects a wrong Host header, a foreign Origin, and writes that are not JSON,
so other websites in your browser cannot talk to the local API.
"""
import ipaddress
from urllib.parse import urlsplit

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

LOCAL_HOSTS = {"127.0.0.1", "localhost"}
WRITE_METHODS = {"POST", "PUT", "DELETE"}


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def _home_network_ip(hostname: str | None) -> bool:
    """A private IP address typed as is (192.168.x.x and the like). A name could be
    pointed at this laptop by another site (DNS rebinding); a bare IP can't."""
    try:
        return ipaddress.ip_address(hostname or "").is_private
    except ValueError:
        return False


class HostOriginMiddleware:
    def __init__(self, app: ASGIApp, lan: bool = False) -> None:
        self.app = app
        self.lan = lan  # with --lan, the laptop's home-network address is allowed too

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

    def _check(self, method: str, headers: dict[str, str]) -> JSONResponse | None:
        host = headers.get("host", "")
        hostname = urlsplit("//" + host).hostname
        if hostname not in LOCAL_HOSTS and not (self.lan and _home_network_ip(hostname)):
            return error_response(403, "forbidden_host", "Requests must go to 127.0.0.1 or localhost.")

        origin = headers.get("origin")
        if origin is not None and urlsplit(origin).netloc != host:
            return error_response(403, "forbidden_origin", "Requests from other sites are not allowed.")

        if method in WRITE_METHODS:
            has_body = headers.get("content-length", "0") != "0" or "transfer-encoding" in headers
            content_type = headers.get("content-type", "").split(";")[0].strip().lower()
            if has_body and content_type != "application/json":
                return error_response(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.")
        return None

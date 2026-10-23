"""Entry point of the server: builds the app and wires everything together."""
from fastapi import FastAPI

from app.security import HostOriginMiddleware


def create_app(db_path: str = "compass.db") -> FastAPI:
    app = FastAPI(title="Compass")
    app.add_middleware(HostOriginMiddleware)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    # TODO (Task 8): include the API router.
    # Later: serve the web/ folder as static files.
    return app


app = create_app()

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import sessionmaker

from backend.app.api import router
from backend.app.config import get_data_root
from backend.app.db import create_database_engine
from backend.app.sources import router as sources_router


@asynccontextmanager
async def lifespan(application: FastAPI):
    get_data_root().mkdir(parents=True, exist_ok=True)
    engine = create_database_engine()
    application.state.session_factory = sessionmaker(engine, autoflush=False, expire_on_commit=False)
    try:
        yield
    finally:
        engine.dispose()


async def request_validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            "location": list(error.get("loc", ())),
            "message": error.get("msg", "Invalid value"),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed.",
                "details": {"errors": errors},
                "retryable": False,
            }
        },
    )


async def http_error_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", "HTTP_ERROR"))
        message = str(exc.detail.get("message", "Request could not be completed."))
        details = {key: value for key, value in exc.detail.items() if key not in {"code", "message"}}
    else:
        code = "HTTP_ERROR"
        message = str(exc.detail)
        details = {}
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
                "retryable": exc.status_code >= 500,
            }
        },
        headers=exc.headers,
    )


def create_app() -> FastAPI:
    application = FastAPI(title="PO Intelligence Hub API", version="2.0.0", lifespan=lifespan)
    application.include_router(router)
    application.include_router(sources_router)
    application.add_exception_handler(RequestValidationError, request_validation_error_handler)
    application.add_exception_handler(HTTPException, http_error_handler)

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()

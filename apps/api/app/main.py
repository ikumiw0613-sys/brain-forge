import logging
from contextlib import asynccontextmanager

import httpx2
import psycopg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.attempts import handle_attempt_error
from app.api.attempts import router as attempts_router
from app.api.health import router as health_router
from app.api.judge0 import handle_judge0_error
from app.api.judge0 import router as judge0_router
from app.core.auth import SupabaseAuth
from app.core.config import Settings
from app.services.attempts import AttemptError, AttemptService
from app.services.judge0 import Judge0Client, Judge0Error
from app.services.postgres_attempts import PostgresAttemptStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    app.state.supabase_auth = (
        SupabaseAuth(str(settings.supabase_url), settings.supabase_publishable_key.get_secret_value())
        if settings.supabase_url and settings.supabase_publishable_key
        else None
    )
    app.state.attempt_service = (
        AttemptService(PostgresAttemptStore(settings.supabase_db_url.get_secret_value()))
        if settings.supabase_db_url
        else None
    )
    if app.state.supabase_auth is None or app.state.attempt_service is None:
        logging.getLogger("uvicorn.error").info("Supabase game API configuration is incomplete.")

    app.state.judge0 = None
    if not settings.judge0_enabled:
        yield
        return

    headers = {"Accept": "application/json", "Accept-Encoding": "identity"}
    if settings.judge0_auth_token is not None:
        headers["X-Auth-Token"] = settings.judge0_auth_token.get_secret_value()
    async with httpx2.AsyncClient(
        base_url=str(settings.judge0_base_url),
        timeout=settings.judge0_request_timeout,
        limits=httpx2.Limits(max_connections=4, max_keepalive_connections=4),
        follow_redirects=False,
        trust_env=False,
        headers=headers,
    ) as http:
        assert settings.judge0_python_language_id is not None
        app.state.judge0 = Judge0Client(
            http,
            python_language_id=settings.judge0_python_language_id,
            request_timeout=settings.judge0_request_timeout,
            max_poll_seconds=settings.judge0_max_poll_seconds,
            max_poll_attempts=settings.judge0_max_poll_attempts,
        )
        try:
            yield
        finally:
            app.state.judge0 = None


app = FastAPI(title="Brain Forge API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization"],
)


@app.exception_handler(psycopg.Error)
async def handle_database_error(_request: Request, error: psycopg.Error) -> JSONResponse:
    logging.getLogger("uvicorn.error").warning("Game database request failed (%s).", type(error).__name__)
    return JSONResponse(status_code=503, content={"detail": "database_unavailable"})


app.add_exception_handler(AttemptError, handle_attempt_error)
app.add_exception_handler(Judge0Error, handle_judge0_error)
app.include_router(health_router, prefix="/api/v1")
app.include_router(attempts_router, prefix="/api/v1")
app.include_router(judge0_router, prefix="/api/v1")

import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.attempts import handle_attempt_error
from app.api.attempts import router as attempts_router
from app.api.health import router as health_router
from app.core.auth import SupabaseAuth
from app.core.config import Settings
from app.services.attempts import AttemptError, AttemptService
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
    yield


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
app.include_router(health_router, prefix="/api/v1")
app.include_router(attempts_router, prefix="/api/v1")

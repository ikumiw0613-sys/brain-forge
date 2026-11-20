import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router
from app.core.config import Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    if not (settings.supabase_url and settings.supabase_secret_key):
        logging.getLogger("uvicorn.error").info("Supabase is not configured for the API.")
    yield


app = FastAPI(title="Brain Forge API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
)
app.include_router(router, prefix="/api/v1")

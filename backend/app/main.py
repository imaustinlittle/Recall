import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app import models
from app.limiter import limiter
from app.routers import auth, meetings, upload, transcript, speakers, jobs
from app.routers import admin

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

_SENSITIVE_SKIP = {"huggingface_token", "secret_key", "database_url", "database_sync_url", "redis_url"}


async def _apply_db_settings() -> None:
    """
    Load any saved overrides from the app_settings table and patch the live
    settings object so all subsequent code sees the DB-configured values.
    """
    try:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(select(models.AppSetting))).scalars().all()
            for row in rows:
                if not hasattr(settings, row.key):
                    continue
                # Coerce string value to the correct type
                current = getattr(settings, row.key)
                if isinstance(current, bool):
                    coerced = row.value.lower() in ("true", "1", "yes")
                elif isinstance(current, int):
                    coerced = int(row.value)
                else:
                    coerced = row.value
                setattr(settings, row.key, coerced)
                key_display = "***" if row.key in _SENSITIVE_SKIP else row.value
                logger.info(f"[config] DB override: {row.key} = {key_display}")
    except Exception:
        # DB might not be ready yet on very first startup — not fatal
        logger.warning("[config] Could not load DB settings (will use env defaults)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.media_root).mkdir(parents=True, exist_ok=True)

    # Apply DB-stored settings overrides on top of env vars
    await _apply_db_settings()

    if settings.secret_key_is_default:
        logger.warning(
            "⚠️  SECRET_KEY is set to the default placeholder value. "
            "Generate a strong random key before exposing this service publicly."
        )

    logger.info(f"Media root: {settings.media_root}")
    logger.info(
        f"Whisper model: {settings.whisper_model} | "
        f"device: {settings.whisper_device} | "
        f"diarization: {settings.use_diarization}"
    )
    logger.info(f"CORS origins: {settings.cors_origins_list}")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Recall API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# Serve uploaded media files directly in development.
# In production replace this with nginx static file serving.
media_path = Path(settings.media_root)
if media_path.exists():
    app.mount("/media", StaticFiles(directory=str(media_path)), name="media")

# Routers
app.include_router(auth.router,       prefix="/api/auth",     tags=["auth"])
app.include_router(meetings.router,   prefix="/api/meetings", tags=["meetings"])
app.include_router(upload.router,     prefix="/api",          tags=["upload"])
app.include_router(transcript.router, prefix="/api",          tags=["transcript"])
app.include_router(speakers.router,   prefix="/api",          tags=["speakers"])
app.include_router(jobs.router,       prefix="/api",          tags=["jobs"])
app.include_router(admin.router,      prefix="/api/admin",    tags=["admin"])


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "0.1.0"}

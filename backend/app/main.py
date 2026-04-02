import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, meetings, upload, transcript, speakers, jobs

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.media_root).mkdir(parents=True, exist_ok=True)
    logger.info(f"Media root: {settings.media_root}")
    logger.info(f"Whisper model: {settings.whisper_model} | diarization: {settings.use_diarization}")
    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Meetscribe API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "0.1.0"}

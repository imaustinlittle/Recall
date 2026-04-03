import uuid
import logging
from pathlib import Path

import magic
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db
from app.deps import get_current_user
from app.config import settings
from app import models
from app.schemas.job import JobOut
from app.workers.tasks import process_meeting

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".mp4", ".mov", ".webm", ".ogg", ".flac"}

ALLOWED_MIMES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "audio/ogg",
    "audio/flac",
    "audio/x-flac",
    "application/ogg",
}


def _safe_filename(raw: str | None, fallback: str) -> str:
    """Strip path components and limit length to protect the DB column (500 chars)."""
    if not raw:
        return fallback
    name = Path(raw).name  # strip any directory traversal
    return name[:255] if name else fallback


@router.post("/meetings/{meeting_id}/upload", response_model=JobOut)
async def upload_media(
    meeting_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify meeting ownership
    result = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == current_user.id,
        )
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Reject if a job is already active for this meeting
    active = await db.execute(
        select(models.Job).where(
            models.Job.meeting_id == meeting_id,
            models.Job.status.in_([models.JobStatus.queued, models.JobStatus.processing]),
        )
    )
    if active.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="A transcription job is already active for this meeting",
        )

    # Validate file extension
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported format '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Stream file to disk — never load large files fully into memory
    dest_dir = Path(settings.media_root) / str(meeting_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_id = uuid.uuid4()
    dest_path = dest_dir / f"{file_id}{suffix}"

    try:
        bytes_written = 0
        max_bytes = settings.max_upload_bytes
        with dest_path.open("wb") as f:
            while chunk := file.file.read(1024 * 1024):  # 1 MB chunks
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum size of {max_bytes // (1024**3)} GB",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        dest_path.unlink(missing_ok=True)
        logger.exception(f"Failed to save upload for meeting {meeting_id}")
        raise HTTPException(status_code=500, detail="Failed to save file")

    # Validate actual MIME type against file content (not just extension)
    detected_mime = magic.from_file(str(dest_path), mime=True)
    if detected_mime not in ALLOWED_MIMES:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail=f"File content type '{detected_mime}' is not an accepted audio/video format",
        )

    file_size = dest_path.stat().st_size
    logger.info(f"Saved upload: {dest_path} ({file_size:,} bytes, mime={detected_mime})")

    # Persist MediaFile record
    media = models.MediaFile(
        id=file_id,
        meeting_id=meeting_id,
        file_path=str(dest_path),
        original_filename=_safe_filename(file.filename, f"{file_id}{suffix}"),
        mime_type=detected_mime,
        file_size_bytes=file_size,
        storage_backend=settings.storage_backend,
    )
    db.add(media)

    # Update meeting status
    meeting.status = models.MeetingStatus.queued

    # Create job record
    job = models.Job(
        meeting_id=meeting_id,
        job_type=models.JobType.transcription,
        status=models.JobStatus.queued,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Dispatch Celery task (non-blocking)
    task = process_meeting.apply_async(
        args=[str(meeting_id), str(file_id)],
        queue="transcription",
    )
    job.celery_task_id = task.id
    await db.commit()
    await db.refresh(job)

    logger.info(f"Queued transcription task {task.id} for meeting {meeting_id}")
    return job


@router.get("/meetings/{meeting_id}/media")
async def list_media(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.MediaFile)
        .join(models.Meeting)
        .where(
            models.MediaFile.meeting_id == meeting_id,
            models.Meeting.user_id == current_user.id,
        )
    )
    return result.scalars().all()

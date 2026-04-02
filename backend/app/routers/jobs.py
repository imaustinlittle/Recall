import uuid
import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db, AsyncSessionLocal
from app.deps import get_current_user
from app import models
from app.schemas.job import JobOut

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.Job)
        .join(models.Meeting)
        .where(
            models.Job.id == job_id,
            models.Meeting.user_id == current_user.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/meetings/{meeting_id}/jobs", response_model=list[JobOut])
async def list_jobs(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    result = await db.execute(
        select(models.Job)
        .join(models.Meeting)
        .where(
            models.Job.meeting_id == meeting_id,
            models.Meeting.user_id == current_user.id,
        )
        .order_by(models.Job.created_at.desc())
    )
    return result.scalars().all()


@router.websocket("/ws/jobs/{job_id}")
async def job_progress_ws(job_id: uuid.UUID, websocket: WebSocket):
    """
    WebSocket endpoint that streams job progress until completion.
    Polls the DB every 1.5 seconds and pushes updates to the client.
    Falls back gracefully — the frontend also has a polling fallback.
    """
    await websocket.accept()
    logger.info(f"WebSocket connected for job {job_id}")

    try:
        while True:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(models.Job).where(models.Job.id == job_id)
                )
                job = result.scalar_one_or_none()

            if not job:
                await websocket.send_text(
                    json.dumps({"error": "Job not found"})
                )
                break

            payload = {
                "id": str(job.id),
                "status": job.status.value,
                "progress": job.progress,
                "message": job.message,
                "error_info": job.error_info,
            }
            await websocket.send_text(json.dumps(payload))

            if job.status in (
                models.JobStatus.completed,
                models.JobStatus.failed,
                models.JobStatus.cancelled,
            ):
                break

            await asyncio.sleep(1.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    except Exception as exc:
        logger.exception(f"WebSocket error for job {job_id}: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass

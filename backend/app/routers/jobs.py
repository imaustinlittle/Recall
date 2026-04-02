import uuid
import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db, AsyncSessionLocal
from app.deps import get_current_user
from app.config import settings
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
async def job_progress_ws(
    job_id: uuid.UUID,
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint that streams job progress until completion.
    Requires a valid JWT passed as ?token=<access_token>.
    Uses Redis pub/sub for real-time updates, falls back to DB polling.
    """
    # Authenticate before accepting the connection
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    # Verify the job belongs to this user
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(models.Job)
            .join(models.Meeting)
            .where(
                models.Job.id == job_id,
                models.Meeting.user_id == uuid.UUID(user_id),
            )
        )
        if not result.scalar_one_or_none():
            await websocket.close(code=4003)
            return

    await websocket.accept()
    logger.info(f"WebSocket connected for job {job_id}")

    _terminal = {models.JobStatus.completed, models.JobStatus.failed, models.JobStatus.cancelled}

    try:
        redis = aioredis.from_url(settings.redis_url)
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"job:{job_id}")

        # Send current state immediately so the client isn't waiting for the first event
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(models.Job).where(models.Job.id == job_id))
            job = result.scalar_one_or_none()
        if not job:
            await websocket.send_text(json.dumps({"error": "Job not found"}))
            return
        await websocket.send_text(json.dumps({
            "id": str(job.id),
            "status": job.status.value,
            "progress": job.progress,
            "message": job.message,
            "error_info": job.error_info,
        }))
        if job.status in _terminal:
            return

        # Stream updates from Redis pub/sub
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            data = json.loads(message["data"])
            await websocket.send_text(json.dumps(data))
            if data.get("status") in {s.value for s in _terminal}:
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for job {job_id}")
    except Exception as exc:
        logger.exception(f"WebSocket error for job {job_id}: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        try:
            await pubsub.unsubscribe(f"job:{job_id}")
            await redis.aclose()
        except Exception:
            pass

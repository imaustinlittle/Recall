import logging
from datetime import datetime, timezone

from celery import Celery
from celery.signals import worker_ready

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "recall",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_track_started=True,
    task_acks_late=True,           # only ack after task finishes — safe on worker crash
    worker_prefetch_multiplier=1,  # one task at a time per worker slot

    # Routing
    task_routes={
        "app.workers.tasks.process_meeting": {"queue": "transcription"},
    },

    # Timeouts — transcription of a 2-hour meeting can take a while on CPU
    task_soft_time_limit=3600,     # raises SoftTimeLimitExceeded at 60 min
    task_time_limit=4200,          # hard kill at 70 min

    # Result expiry
    result_expires=86400,          # keep results for 24 h
)


@worker_ready.connect
def cleanup_stuck_jobs(**kwargs):
    """
    On worker (re)start, mark any jobs that were left in 'processing' state
    as failed. These are jobs that were in-flight when the worker previously
    crashed or was restarted.
    """
    from app.database import get_sync_session
    from app import models

    with get_sync_session() as db:
        stuck = (
            db.query(models.Job)
            .filter(models.Job.status == models.JobStatus.processing)
            .all()
        )
        if not stuck:
            return

        logger.warning(f"[startup] Found {len(stuck)} stuck job(s) — marking failed")
        for job in stuck:
            job.status = models.JobStatus.failed
            job.error_info = {"error": "Worker restarted while job was in progress"}
            job.completed_at = datetime.now(timezone.utc)

            meeting = db.get(models.Meeting, job.meeting_id)
            if meeting and meeting.status == models.MeetingStatus.processing:
                meeting.status = models.MeetingStatus.failed

        db.commit()
        logger.info(f"[startup] Cleaned up {len(stuck)} stuck job(s)")

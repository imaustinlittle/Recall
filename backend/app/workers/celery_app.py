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

    # Timeouts — large files with diarization can take several hours
    task_soft_time_limit=21600,    # soft limit: 6 hours
    task_time_limit=25200,         # hard kill: 7 hours

    # Result expiry
    result_expires=86400,          # keep results for 24 h
)


@worker_ready.connect
def apply_db_settings(**kwargs):
    """
    Load DB-stored settings overrides on worker startup, same as FastAPI does.
    This ensures USE_DIARIZATION, WHISPER_COMPUTE_TYPE, etc. set via the
    admin UI are respected by the worker without needing a full redeploy.
    """
    from app.database import get_sync_session
    from app import models

    try:
        with get_sync_session() as db:
            rows = db.query(models.AppSetting).all()
            for row in rows:
                if not hasattr(settings, row.key):
                    continue
                current = getattr(settings, row.key)
                if isinstance(current, bool):
                    coerced = row.value.lower() in ("true", "1", "yes")
                elif isinstance(current, int):
                    coerced = int(row.value)
                else:
                    coerced = row.value
                setattr(settings, row.key, coerced)
                logger.info(f"[worker config] DB override: {row.key} = {coerced}")

        # Clear the cached Whisper model if compute settings changed
        if row.key in ("whisper_model", "whisper_device", "whisper_compute_type"):
            try:
                from app.services.transcription import _get_model
                _get_model.cache_clear()
            except Exception:
                pass
    except Exception:
        logger.warning("[worker config] Could not load DB settings — using env defaults")


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

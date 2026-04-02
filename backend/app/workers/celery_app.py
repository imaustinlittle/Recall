from celery import Celery
from app.config import settings

celery_app = Celery(
    "meetscribe",
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

import uuid
import json
import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path

import redis as redis_client

from app.workers.celery_app import celery_app
from app.config import settings
from app.database import get_sync_session
from app import models

_redis = redis_client.from_url(settings.redis_url)


def _publish_job(job: models.Job) -> None:
    """Push a job-state snapshot to the Redis pub/sub channel for this job."""
    payload = json.dumps({
        "id": str(job.id),
        "status": job.status.value,
        "progress": job.progress,
        "message": job.message,
        "error_info": job.error_info,
    })
    _redis.publish(f"job:{job.id}", payload)

logger = logging.getLogger(__name__)

# Default speaker colours (cycles if more than 8 speakers detected)
SPEAKER_COLORS = [
    "#6366f1",  # indigo
    "#f59e0b",  # amber
    "#10b981",  # emerald
    "#ef4444",  # red
    "#8b5cf6",  # violet
    "#06b6d4",  # cyan
    "#f97316",  # orange
    "#84cc16",  # lime
]


def _set_job(db, job: models.Job, **kwargs):
    """Update job fields and flush (no commit — caller commits)."""
    for k, v in kwargs.items():
        setattr(job, k, v)
    db.flush()


@celery_app.task(bind=True, name="process_meeting", max_retries=2, default_retry_delay=60)
def process_meeting(self, meeting_id: str, media_file_id: str):
    """
    Main transcription pipeline task.

    Steps:
      1. Load the uploaded media file path from the DB
      2. Extract / normalise audio to 16 kHz mono WAV via FFmpeg
      3. Transcribe with faster-whisper
      4. (Optional) Run speaker diarization with pyannote
      5. Persist Speaker and TranscriptSegment rows
      6. Mark meeting as 'transcribed'
    """
    logger.info(f"[process_meeting] start  meeting={meeting_id}")

    with get_sync_session() as db:
        job = db.query(models.Job).filter_by(meeting_id=meeting_id).first()

        try:
            # ── 1. Mark as started ────────────────────────────────────────
            _set_job(db, job,
                     status=models.JobStatus.processing,
                     started_at=datetime.now(timezone.utc),
                     progress=0.05,
                     message="Starting")
            db.commit()
            _publish_job(job)

            # ── 2. Resolve media file ─────────────────────────────────────
            media = db.get(models.MediaFile, uuid.UUID(media_file_id))
            if not media:
                raise ValueError(f"MediaFile {media_file_id} not found in database")

            input_path = media.file_path
            logger.info(f"[process_meeting] input file: {input_path}")

            # ── 3. Extract audio ──────────────────────────────────────────
            _set_job(db, job, progress=0.10, message="Extracting audio")
            db.commit()
            _publish_job(job)

            from app.services.audio import extract_wav, get_duration
            wav_path = extract_wav(input_path)
            duration = get_duration(wav_path)
            media.duration_seconds = int(duration)
            db.commit()

            logger.info(f"[process_meeting] audio extracted, duration={duration:.1f}s")

            # ── 4. Transcribe ─────────────────────────────────────────────
            _set_job(db, job, progress=0.20, message="Transcribing")
            db.commit()
            _publish_job(job)

            from app.services.transcription import transcribe
            raw_segments = transcribe(wav_path)
            logger.info(f"[process_meeting] transcribed {len(raw_segments)} segments")

            # ── 5. Diarize ────────────────────────────────────────────────
            if settings.use_diarization:
                _set_job(db, job, progress=0.65, message="Identifying speakers")
                db.commit()
                _publish_job(job)

                from app.services.diarization import assign_speakers
                raw_segments = assign_speakers(wav_path, raw_segments)
            else:
                for seg in raw_segments:
                    seg["speaker_label"] = "SPEAKER_00"

            # ── 6. Persist speakers ───────────────────────────────────────
            _set_job(db, job, progress=0.80, message="Saving speakers")
            db.commit()
            _publish_job(job)

            unique_labels = sorted(
                {s["speaker_label"] for s in raw_segments if s.get("speaker_label")}
            )
            speaker_map: dict[str, models.Speaker] = {}

            for i, label in enumerate(unique_labels):
                speaker = models.Speaker(
                    meeting_id=uuid.UUID(meeting_id),
                    label=label,
                    display_name=f"Speaker {i + 1}",
                    color_hex=SPEAKER_COLORS[i % len(SPEAKER_COLORS)],
                )
                db.add(speaker)
                db.flush()
                speaker_map[label] = speaker

            # ── 7. Persist transcript segments ────────────────────────────
            _set_job(db, job, progress=0.88, message="Saving transcript")
            db.commit()
            _publish_job(job)

            for idx, seg in enumerate(raw_segments):
                label = seg.get("speaker_label", "SPEAKER_00")
                speaker = speaker_map.get(label)
                db.add(models.TranscriptSegment(
                    meeting_id=uuid.UUID(meeting_id),
                    speaker_id=speaker.id if speaker else None,
                    segment_index=idx,
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    content=seg["text"],
                    confidence=seg.get("confidence"),
                ))

            # ── 8. Finalise ───────────────────────────────────────────────
            meeting = db.get(models.Meeting, uuid.UUID(meeting_id))
            meeting.status = models.MeetingStatus.transcribed

            _set_job(db, job,
                     status=models.JobStatus.completed,
                     progress=1.0,
                     completed_at=datetime.now(timezone.utc),
                     message=f"Done — {len(raw_segments)} segments")
            db.commit()
            _publish_job(job)

            # Clean up the intermediate WAV if it differs from the upload
            if wav_path != input_path:
                Path(wav_path).unlink(missing_ok=True)

            logger.info(
                f"[process_meeting] complete  meeting={meeting_id}  "
                f"segments={len(raw_segments)}  speakers={len(speaker_map)}"
            )

        except Exception as exc:
            logger.exception(f"[process_meeting] FAILED  meeting={meeting_id}")
            db.rollback()

            # Write failure state in a fresh session so it always persists
            with get_sync_session() as db2:
                j = db2.query(models.Job).filter_by(meeting_id=meeting_id).first()
                if j:
                    j.status = models.JobStatus.failed
                    j.error_info = {
                        "error": str(exc),
                        "type": type(exc).__name__,
                        "traceback": traceback.format_exc(),
                    }
                    j.completed_at = datetime.now(timezone.utc)
                m = db2.get(models.Meeting, uuid.UUID(meeting_id))
                if m:
                    m.status = models.MeetingStatus.failed
                db2.commit()

            raise self.retry(exc=exc)

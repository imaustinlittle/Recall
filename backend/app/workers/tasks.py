import uuid
import json
import logging
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

            # Automatically kick off summarization
            summarize_meeting.apply_async(args=[meeting_id], queue="default")

        except Exception as exc:
            logger.exception(f"[process_meeting] FAILED  meeting={meeting_id}")
            db.rollback()

            # Write failure state in a fresh session so it always persists
            with get_sync_session() as db2:
                j = db2.query(models.Job).filter_by(meeting_id=meeting_id).first()
                if j:
                    j.status = models.JobStatus.failed
                    # Store only the error type and message — not the full traceback,
                    # which can expose server file paths and internal details.
                    j.error_info = {
                        "error": str(exc),
                        "type": type(exc).__name__,
                    }
                    j.completed_at = datetime.now(timezone.utc)
                m = db2.get(models.Meeting, uuid.UUID(meeting_id))
                if m:
                    m.status = models.MeetingStatus.failed
                db2.commit()

            raise self.retry(exc=exc)


@celery_app.task(name="self_check")
def self_check() -> dict:
    """
    Lightweight worker-side diagnostics for the admin Settings page.
    Reports the environment the worker actually sees — it does NOT load models
    (that would be slow), only checks imports and CUDA availability.
    """
    result = {
        "whisper_model": settings.whisper_model,
        "whisper_device": settings.whisper_device,
        "whisper_compute_type": settings.whisper_compute_type,
        "use_diarization": settings.use_diarization,
        "cuda_available": False,
        "cuda_devices": 0,
        "faster_whisper": False,
        "pyannote": False,
    }
    try:
        import torch
        result["cuda_available"] = bool(torch.cuda.is_available())
        result["cuda_devices"] = int(torch.cuda.device_count())
    except Exception:
        pass
    try:
        import faster_whisper  # noqa: F401
        result["faster_whisper"] = True
    except Exception:
        pass
    try:
        import pyannote.audio  # noqa: F401
        result["pyannote"] = True
    except Exception:
        pass
    return result


@celery_app.task(bind=True, name="summarize_meeting", max_retries=1, default_retry_delay=30)
def summarize_meeting(self, meeting_id: str):
    """
    Summarize a meeting transcript using a local Ollama LLM.
    Stores the result in meetings.summary.
    """
    logger.info(f"[summarize_meeting] start  meeting={meeting_id}")

    try:
        with get_sync_session() as db:
            meeting = db.get(models.Meeting, uuid.UUID(meeting_id))
            if not meeting:
                logger.warning(f"[summarize_meeting] meeting {meeting_id} not found")
                return

            segments = (
                db.query(models.TranscriptSegment)
                .filter_by(meeting_id=uuid.UUID(meeting_id))
                .order_by(models.TranscriptSegment.segment_index)
                .all()
            )
            if not segments:
                logger.warning(f"[summarize_meeting] no segments for meeting {meeting_id}")
                return

            speaker_map = {
                sp.id: sp
                for sp in db.query(models.Speaker)
                .filter_by(meeting_id=uuid.UUID(meeting_id))
                .all()
            }

            # Build speaker-labeled transcript
            lines = []
            for seg in segments:
                sp = speaker_map.get(seg.speaker_id)
                name = (sp.display_name or sp.label) if sp else "Unknown"
                lines.append(f"[{name}]: {seg.content.strip()}")
            transcript_text = "\n".join(lines)

            prompt = (
                "You are summarizing a recorded meeting transcript.\n\n"
                f"TRANSCRIPT:\n{transcript_text}\n\n"
                "Write a concise meeting summary with three sections:\n"
                "1. **Overview** (2-3 sentences describing what the meeting was about)\n"
                "2. **Key Decisions** (bullet list, or \"None identified\" if none)\n"
                "3. **Action Items** (bullet list with owner if mentioned, or \"None identified\" if none)\n\n"
                "Be concise and factual. Do not invent information not present in the transcript."
            )

            import httpx as _httpx
            response = _httpx.post(
                f"{settings.ollama_base_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                },
                timeout=300.0,
            )
            response.raise_for_status()
            summary = response.json()["response"].strip()

            meeting.summary = summary
            db.commit()

        logger.info(f"[summarize_meeting] complete  meeting={meeting_id}")

    except Exception as exc:
        logger.exception(f"[summarize_meeting] FAILED  meeting={meeting_id}")
        raise self.retry(exc=exc)

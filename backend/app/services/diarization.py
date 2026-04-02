"""
Speaker diarization via pyannote.audio 3.x.

Prerequisites (only needed when USE_DIARIZATION=true):
  1. Uncomment pyannote.audio and torch in requirements.txt and rebuild.
  2. Accept the model license at:
       https://huggingface.co/pyannote/speaker-diarization-3.1
  3. Set HUGGINGFACE_TOKEN in your .env file.
"""
import logging
import functools
from app.config import settings

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=1)
def _get_pipeline():
    try:
        from pyannote.audio import Pipeline
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "pyannote.audio is not installed. "
            "Uncomment it in requirements.txt and rebuild the Docker image."
        ) from exc

    logger.info("Loading pyannote speaker-diarization-3.1 pipeline")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=settings.huggingface_token,
    )
    if torch.cuda.is_available():
        pipeline = pipeline.to(torch.device("cuda"))
        logger.info("Diarization pipeline moved to CUDA")
    return pipeline


def assign_speakers(wav_path: str, segments: list[dict]) -> list[dict]:
    """
    Run diarization on wav_path and assign a speaker label to each segment.
    Uses maximum-overlap matching: the speaker whose turn overlaps most with
    a segment's time window is assigned to that segment.
    """
    pipeline = _get_pipeline()
    diarization = pipeline(wav_path)

    # Build a flat list of (start, end, speaker_label) turns
    turns = [
        (turn.start, turn.end, label)
        for turn, _, label in diarization.itertracks(yield_label=True)
    ]

    for seg in segments:
        seg["speaker_label"] = _best_speaker(seg["start_time"], seg["end_time"], turns)

    logger.info(f"Diarization assigned speakers to {len(segments)} segments")
    return segments


def _best_speaker(seg_start: float, seg_end: float, turns: list[tuple]) -> str:
    best_label = "SPEAKER_00"
    best_overlap = 0.0
    for turn_start, turn_end, label in turns:
        overlap = max(0.0, min(seg_end, turn_end) - max(seg_start, turn_start))
        if overlap > best_overlap:
            best_overlap = overlap
            best_label = label
    return best_label

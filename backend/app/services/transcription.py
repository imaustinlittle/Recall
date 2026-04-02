import logging
import functools
from app.config import settings

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=1)
def _get_model():
    """
    Load the Whisper model once per worker process and cache it.
    lru_cache ensures we don't reload on every task invocation.
    """
    from faster_whisper import WhisperModel

    logger.info(
        f"Loading Whisper model '{settings.whisper_model}' "
        f"on {settings.whisper_device} ({settings.whisper_compute_type})"
    )
    return WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


def transcribe(wav_path: str) -> list[dict]:
    """
    Transcribe a 16 kHz mono WAV file.

    Returns a list of segment dicts:
        {
            start_time: float,
            end_time: float,
            text: str,
            confidence: float,   # avg log-prob, higher = more confident
            speaker_label: None, # filled in by diarization step
        }
    """
    model = _get_model()

    segments_iter, info = model.transcribe(
        wav_path,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    logger.info(
        f"Detected language: {info.language} "
        f"(confidence {info.language_probability:.0%})"
    )

    results = []
    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        results.append({
            "start_time": round(seg.start, 3),
            "end_time": round(seg.end, 3),
            "text": text,
            "confidence": round(seg.avg_logprob, 4),
            "speaker_label": None,
        })

    logger.info(f"Transcribed {len(results)} segments from {wav_path}")
    return results

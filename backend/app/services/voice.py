"""
Speaker voice embeddings via pyannote, for cross-meeting speaker recognition.

Only used when diarization is enabled. Produces one mean embedding per local
speaker from their longest turns, which is then matched against the user's
saved VoiceProfiles.

Prerequisites (in addition to the diarization model):
  - Accept the model license at https://huggingface.co/pyannote/embedding
  - HUGGINGFACE_TOKEN set in the environment
"""
import logging
import functools
from app.config import settings

logger = logging.getLogger(__name__)

# Use up to this many of a speaker's longest segments to build their embedding.
_MAX_SAMPLES_PER_SPEAKER = 5
# Ignore very short turns — too little signal for a stable embedding.
_MIN_SEGMENT_SECONDS = 1.0


@functools.lru_cache(maxsize=1)
def _get_inference():
    from pyannote.audio import Inference

    logger.info(f"Loading voice embedding model '{settings.voice_embed_model}'")
    inference = Inference(
        settings.voice_embed_model,
        window="whole",
        use_auth_token=settings.huggingface_token or None,
    )
    try:
        import torch
        if torch.cuda.is_available():
            inference.to(torch.device("cuda"))
            logger.info("Voice embedding model moved to CUDA")
    except Exception:
        pass
    return inference


def compute_speaker_embeddings(
    wav_path: str, segments: list[dict]
) -> dict[str, list[float]]:
    """
    Compute a mean voice embedding per speaker label.

    `segments` items need: {"speaker_label": str, "start_time": float, "end_time": float}
    Returns {speaker_label: embedding_list}. Speakers with no usable audio are
    omitted. Any failure returns {} so transcription still succeeds.
    """
    try:
        import numpy as np
        from pyannote.core import Segment

        inference = _get_inference()

        by_speaker: dict[str, list[tuple[float, float]]] = {}
        for seg in segments:
            label = seg.get("speaker_label")
            if not label:
                continue
            dur = seg["end_time"] - seg["start_time"]
            if dur < _MIN_SEGMENT_SECONDS:
                continue
            by_speaker.setdefault(label, []).append((seg["start_time"], seg["end_time"]))

        out: dict[str, list[float]] = {}
        for label, spans in by_speaker.items():
            spans.sort(key=lambda s: s[1] - s[0], reverse=True)
            vectors = []
            for start, end in spans[:_MAX_SAMPLES_PER_SPEAKER]:
                try:
                    vec = inference.crop(wav_path, Segment(start, end))
                    vectors.append(np.asarray(vec, dtype="float32").reshape(-1))
                except Exception as exc:
                    logger.debug(f"[voice] crop failed for {label} [{start:.1f}-{end:.1f}]: {exc}")
            if vectors:
                mean = np.mean(np.vstack(vectors), axis=0)
                out[label] = mean.tolist()

        logger.info(f"[voice] computed embeddings for {len(out)} speaker(s)")
        return out

    except Exception:
        logger.exception("[voice] embedding computation failed — skipping")
        return {}


def cosine_similarity(a: list[float], b: list[float]) -> float:
    import numpy as np
    va = np.asarray(a, dtype="float32")
    vb = np.asarray(b, dtype="float32")
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0.0:
        return 0.0
    return float(np.dot(va, vb) / denom)

"""
Text embeddings via a local Ollama model, used for transcript-chat RAG.

Two entry points:
  - embed_texts(...)  — synchronous, for the Celery indexing task
  - embed_query(...)  — async, for the chat request path

Both call Ollama's /api/embeddings endpoint (one prompt per call, which every
Ollama version supports).
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Group consecutive transcript segments into chunks of roughly this many
# characters before starting a new chunk (~300-400 tokens of context each).
CHUNK_TARGET_CHARS = 1500


def chunk_segments(labeled_segments: list[dict]) -> list[dict]:
    """
    Group consecutive segments into retrieval chunks.

    Each input item: {"speaker": str, "start": float, "end": float, "text": str}
    Returns: [{"content": str, "start_time": float, "end_time": float}, ...]
    Speaker names are inlined so retrieved context carries who-said-what.
    """
    chunks: list[dict] = []
    cur_lines: list[str] = []
    cur_len = 0
    cur_start: float | None = None
    cur_end: float = 0.0

    def flush():
        nonlocal cur_lines, cur_len, cur_start, cur_end
        if cur_lines:
            chunks.append({
                "content": "\n".join(cur_lines),
                "start_time": cur_start or 0.0,
                "end_time": cur_end,
            })
        cur_lines = []
        cur_len = 0
        cur_start = None
        cur_end = 0.0

    for seg in labeled_segments:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        line = f"[{seg.get('speaker') or 'Unknown'}] {text}"
        if cur_start is None:
            cur_start = seg["start"]
        cur_end = seg["end"]
        cur_lines.append(line)
        cur_len += len(line)
        if cur_len >= CHUNK_TARGET_CHARS:
            flush()

    flush()
    return chunks


def _embeddings_url() -> str:
    return f"{(settings.ollama_base_url or '').rstrip('/')}/api/embeddings"


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Synchronous embedding of multiple texts (Celery task path)."""
    url = _embeddings_url()
    model = settings.ollama_embed_model
    out: list[list[float]] = []
    with httpx.Client(timeout=120.0) as client:
        for text in texts:
            resp = client.post(url, json={"model": model, "prompt": text})
            resp.raise_for_status()
            out.append(resp.json()["embedding"])
    return out


async def embed_query(text: str) -> list[float]:
    """Async embedding of a single query string (chat request path)."""
    url = _embeddings_url()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url, json={"model": settings.ollama_embed_model, "prompt": text}
        )
        resp.raise_for_status()
        return resp.json()["embedding"]

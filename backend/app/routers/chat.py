"""
Transcript chat (RAG over a single meeting).

  GET    /api/meetings/{id}/chat        — message history + index status
  POST   /api/meetings/{id}/chat        — ask a question (Server-Sent Events stream)
  POST   /api/meetings/{id}/chat/index  — (re)build the embedding index
  DELETE /api/meetings/{id}/chat        — clear the thread

Retrieval uses pgvector cosine distance over this meeting's transcript chunks;
generation streams from the local Ollama chat model. No audio or text leaves
the host.
"""
import uuid
import json
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.database import get_async_db, AsyncSessionLocal
from app.deps import get_current_user
from app.config import settings
from app import models
from app.limiter import limiter
from app.services.embeddings import embed_query

router = APIRouter()
logger = logging.getLogger(__name__)

TOP_K = 6              # chunks retrieved per question
HISTORY_LIMIT = 10     # prior messages included as conversation context
SNIPPET_CHARS = 160


class ChatAsk(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def _validate(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message must not be empty")
        if len(v) > 4000:
            raise ValueError("Message must be 4000 characters or fewer")
        return v


@router.get("/meetings/{meeting_id}/chat")
async def get_chat(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_owner(db, meeting_id, current_user.id)
    msgs = (await db.execute(
        select(models.ChatMessage)
        .where(models.ChatMessage.meeting_id == meeting_id)
        .order_by(models.ChatMessage.created_at)
    )).scalars().all()

    chunk_count = (await db.execute(
        select(func.count())
        .select_from(models.TranscriptChunk)
        .where(models.TranscriptChunk.meeting_id == meeting_id)
    )).scalar_one()

    return {
        "indexed": chunk_count > 0,
        "chunk_count": chunk_count,
        "messages": [
            {
                "id": str(m.id),
                "role": m.role.value,
                "content": m.content,
                "citations": m.citations,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
    }


@router.post("/meetings/{meeting_id}/chat/index")
async def index_chat(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Enqueue (re)building this meeting's embedding index."""
    await _assert_owner(db, meeting_id, current_user.id)
    has_transcript = (await db.execute(
        select(models.TranscriptSegment.id)
        .where(models.TranscriptSegment.meeting_id == meeting_id)
        .limit(1)
    )).scalar_one_or_none()
    if not has_transcript:
        raise HTTPException(status_code=422, detail="Meeting has no transcript to index")

    from app.workers.tasks import embed_meeting
    embed_meeting.apply_async(args=[str(meeting_id)], queue="default")
    return {"status": "queued"}


@router.delete("/meetings/{meeting_id}/chat", status_code=204)
async def clear_chat(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_owner(db, meeting_id, current_user.id)
    await db.execute(
        delete(models.ChatMessage).where(models.ChatMessage.meeting_id == meeting_id)
    )
    await db.commit()


@router.post("/meetings/{meeting_id}/chat")
@limiter.limit("30/minute")
async def ask_chat(
    request: Request,
    meeting_id: uuid.UUID,
    body: ChatAsk,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_owner(db, meeting_id, current_user.id)

    # Retrieve relevant chunks via cosine distance.
    try:
        qvec = await embed_query(body.message)
    except Exception as exc:
        logger.warning(f"[chat] embedding failed: {exc}")
        raise HTTPException(status_code=503, detail="Embedding model unavailable (is Ollama running?)")

    rows = (await db.execute(
        select(models.TranscriptChunk)
        .where(models.TranscriptChunk.meeting_id == meeting_id)
        .order_by(models.TranscriptChunk.embedding.cosine_distance(qvec))
        .limit(TOP_K)
    )).scalars().all()

    if not rows:
        raise HTTPException(
            status_code=409,
            detail="This meeting isn't indexed for chat yet. Index it and try again.",
        )

    # Order retrieved chunks chronologically for a more readable context block.
    rows = sorted(rows, key=lambda c: c.start_time)
    context = "\n\n".join(f"(from {_fmt_ts(c.start_time)})\n{c.content}" for c in rows)
    citations = [
        {"start_time": c.start_time, "snippet": _snippet(c.content)} for c in rows
    ]

    # Recent conversation history (chronological).
    history = list(reversed((await db.execute(
        select(models.ChatMessage)
        .where(models.ChatMessage.meeting_id == meeting_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    )).scalars().all()))

    # Persist the user message immediately.
    db.add(models.ChatMessage(
        meeting_id=meeting_id,
        user_id=current_user.id,
        role=models.ChatRole.user,
        content=body.message,
    ))
    await db.commit()

    chat_messages = _build_prompt(context, history, body.message)

    async def event_stream():
        full = []
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.ollama_base_url.rstrip('/')}/api/chat",
                    json={"model": settings.ollama_model, "messages": chat_messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        delta = (data.get("message") or {}).get("content", "")
                        if delta:
                            full.append(delta)
                            yield _sse({"type": "token", "text": delta})
                        if data.get("done"):
                            break
        except Exception as exc:
            logger.exception("[chat] generation failed")
            yield _sse({"type": "error", "detail": f"Generation failed: {type(exc).__name__}"})
            return

        answer = "".join(full).strip()
        # Persist the assistant message in a fresh session (request session may be closed).
        try:
            async with AsyncSessionLocal() as s:
                s.add(models.ChatMessage(
                    meeting_id=meeting_id,
                    user_id=current_user.id,
                    role=models.ChatRole.assistant,
                    content=answer or "(no response)",
                    citations=citations,
                ))
                await s.commit()
        except Exception:
            logger.exception("[chat] failed to persist assistant message")

        yield _sse({"type": "done", "citations": citations})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Helpers ─────────────────────────────────────────────────────────────────

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _fmt_ts(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def _snippet(text: str) -> str:
    flat = " ".join(text.split())
    return flat[:SNIPPET_CHARS] + ("…" if len(flat) > SNIPPET_CHARS else "")


def _build_prompt(context: str, history: list[models.ChatMessage], question: str) -> list[dict]:
    system = (
        "You are a helpful assistant answering questions about a single recorded "
        "meeting. Use ONLY the transcript excerpts provided to answer. If the "
        "answer isn't in the excerpts, say you couldn't find it in this meeting. "
        "Be concise and factual, and refer to speakers by name when relevant.\n\n"
        f"TRANSCRIPT EXCERPTS:\n{context}"
    )
    messages = [{"role": "system", "content": system}]
    for m in history:
        messages.append({"role": m.role.value, "content": m.content})
    messages.append({"role": "user", "content": question})
    return messages


async def _assert_owner(db: AsyncSession, meeting_id: uuid.UUID, user_id: uuid.UUID):
    r = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == user_id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meeting not found")

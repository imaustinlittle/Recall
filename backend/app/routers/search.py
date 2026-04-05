import uuid
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.limiter import limiter

router = APIRouter()


@router.get("/search")
@limiter.limit("30/minute")
async def search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Full-text search across meeting titles, transcript segments, and notes.
    Returns results grouped by meeting.
    """
    pattern = f"%{q}%"
    user_id = current_user.id

    # Meetings whose title matches
    title_q = await db.execute(
        select(models.Meeting)
        .where(models.Meeting.user_id == user_id)
        .where(models.Meeting.title.ilike(pattern))
        .order_by(models.Meeting.created_at.desc())
        .limit(limit)
    )
    title_meetings = title_q.scalars().all()

    # Transcript segments that match
    seg_q = await db.execute(
        select(models.TranscriptSegment, models.Meeting)
        .join(models.Meeting, models.TranscriptSegment.meeting_id == models.Meeting.id)
        .where(models.Meeting.user_id == user_id)
        .where(models.TranscriptSegment.content.ilike(pattern))
        .order_by(models.Meeting.created_at.desc())
        .limit(limit)
    )
    seg_rows = seg_q.all()

    # Notes that match
    note_q = await db.execute(
        select(models.Note, models.Meeting)
        .join(models.Meeting, models.Note.meeting_id == models.Meeting.id)
        .where(models.Meeting.user_id == user_id)
        .where(models.Note.body.ilike(pattern))
        .order_by(models.Meeting.created_at.desc())
        .limit(limit)
    )
    note_rows = note_q.all()

    # Merge results by meeting, deduplicate
    meetings_by_id: dict[uuid.UUID, dict] = {}

    def _get_or_create(meeting: models.Meeting) -> dict:
        if meeting.id not in meetings_by_id:
            meetings_by_id[meeting.id] = {
                "id": str(meeting.id),
                "title": meeting.title,
                "status": meeting.status.value,
                "created_at": meeting.created_at.isoformat(),
                "snippets": [],
            }
        return meetings_by_id[meeting.id]

    for meeting in title_meetings:
        entry = _get_or_create(meeting)
        entry["snippets"].append({"type": "title", "text": meeting.title})

    for seg, meeting in seg_rows:
        entry = _get_or_create(meeting)
        # Trim segment to a readable snippet around the match
        text = seg.content
        idx = text.lower().find(q.lower())
        start = max(0, idx - 60)
        end = min(len(text), idx + len(q) + 60)
        snippet = ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else "")
        entry["snippets"].append({"type": "transcript", "text": snippet, "start_time": seg.start_time})

    for note, meeting in note_rows:
        entry = _get_or_create(meeting)
        entry["snippets"].append({"type": "note", "text": note.body, "note_type": note.note_type.value})

    # Sort by most recently created meeting, limit total
    results = sorted(meetings_by_id.values(), key=lambda x: x["created_at"], reverse=True)
    return {"query": q, "results": results[:limit]}

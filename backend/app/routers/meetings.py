import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.meeting import MeetingCreate, MeetingUpdate, MeetingOut, MeetingListOut

router = APIRouter()


@router.get("", response_model=MeetingListOut)
async def list_meetings(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: models.MeetingStatus | None = None,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    q = select(models.Meeting).where(models.Meeting.user_id == current_user.id)
    if status:
        q = q.where(models.Meeting.status == status)
    if date_from:
        q = q.where(cast(models.Meeting.created_at, Date) >= date_from)
    if date_to:
        q = q.where(cast(models.Meeting.created_at, Date) <= date_to)
    q = q.order_by(models.Meeting.created_at.desc())

    total_result = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = total_result.scalar_one()

    result = await db.execute(q.offset((page - 1) * limit).limit(limit))
    meetings = result.scalars().all()

    return MeetingListOut(items=meetings, total=total, page=page, limit=limit)


@router.post("", response_model=MeetingOut, status_code=201)
async def create_meeting(
    body: MeetingCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    meeting = models.Meeting(user_id=current_user.id, **body.model_dump())
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    return meeting


@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    meeting = await _get_owned_meeting(db, meeting_id, current_user.id)
    return meeting


@router.patch("/{meeting_id}", response_model=MeetingOut)
async def update_meeting(
    meeting_id: uuid.UUID,
    body: MeetingUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    meeting = await _get_owned_meeting(db, meeting_id, current_user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(meeting, field, value)
    await db.commit()
    await db.refresh(meeting)
    return meeting


@router.delete("/{meeting_id}", status_code=204)
async def delete_meeting(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    meeting = await _get_owned_meeting(db, meeting_id, current_user.id)
    await db.delete(meeting)
    await db.commit()


@router.post("/{meeting_id}/notes/from-summary", status_code=201)
async def import_notes_from_summary(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Parse the AI summary and create Note rows for action items and decisions."""
    meeting = await _get_owned_meeting(db, meeting_id, current_user.id)
    if not meeting.summary:
        raise HTTPException(status_code=422, detail="Meeting has no summary to import from")

    created = 0
    current_section: str | None = None

    for raw_line in meeting.summary.splitlines():
        line = raw_line.strip()
        lower = line.lower()

        # Detect section headings
        if "action item" in lower:
            current_section = "action_item"
            continue
        if "key decision" in lower or "decisions" in lower:
            current_section = "decision"
            continue
        if lower.startswith("1.") or lower.startswith("**overview"):
            current_section = None
            continue

        # Bullet lines
        if current_section and (line.startswith("-") or line.startswith("•") or line.startswith("*")):
            body = line.lstrip("-•* ").strip()
            if not body or body.lower() in ("none identified", "none", "n/a"):
                continue
            db.add(models.Note(
                meeting_id=meeting_id,
                user_id=current_user.id,
                note_type=models.NoteType[current_section],
                body=body,
            ))
            created += 1

    await db.commit()
    return {"created": created}


@router.post("/{meeting_id}/summarize")
async def trigger_summarize(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Enqueue summarization for a meeting. Re-runnable after speaker renames."""
    await _get_owned_meeting(db, meeting_id, current_user.id)

    # Verify there's a transcript to summarize
    result = await db.execute(
        select(models.TranscriptSegment)
        .where(models.TranscriptSegment.meeting_id == meeting_id)
        .limit(1)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Meeting has no transcript to summarize")

    from app.workers.tasks import summarize_meeting
    summarize_meeting.apply_async(args=[str(meeting_id)], queue="default")
    return {"status": "queued"}


# ── Helper ─────────────────────────────────────────────────────────────────
async def _get_owned_meeting(
    db: AsyncSession, meeting_id: uuid.UUID, user_id: uuid.UUID
) -> models.Meeting:
    result = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == user_id,
        )
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting

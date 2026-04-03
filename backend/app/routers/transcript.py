import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.transcript import SegmentOut, SegmentUpdate, SegmentSplit, SegmentMerge

router = APIRouter()


@router.get("/meetings/{meeting_id}/transcript", response_model=list[SegmentOut])
async def get_transcript(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.TranscriptSegment)
        .where(models.TranscriptSegment.meeting_id == meeting_id)
        .options(selectinload(models.TranscriptSegment.speaker))
        .order_by(models.TranscriptSegment.segment_index)
    )
    return result.scalars().all()


@router.patch("/meetings/{meeting_id}/transcript/{segment_id}", response_model=SegmentOut)
async def update_segment(
    meeting_id: uuid.UUID,
    segment_id: uuid.UUID,
    body: SegmentUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.TranscriptSegment)
        .where(
            models.TranscriptSegment.id == segment_id,
            models.TranscriptSegment.meeting_id == meeting_id,
        )
        .options(selectinload(models.TranscriptSegment.speaker))
    )
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(segment, field, value)

    segment.is_edited = True
    segment.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(segment)
    return segment


@router.post("/meetings/{meeting_id}/transcript/split", response_model=list[SegmentOut])
async def split_segment(
    meeting_id: uuid.UUID,
    body: SegmentSplit,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Split one segment into two at a given timestamp."""
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.TranscriptSegment).where(
            models.TranscriptSegment.id == body.segment_id,
            models.TranscriptSegment.meeting_id == meeting_id,
        )
    )
    seg = result.scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    if not (seg.start_time < body.split_at_time < seg.end_time):
        raise HTTPException(status_code=422, detail="split_at_time must be within segment bounds")

    # Shift all subsequent segment indexes up by 1
    all_after = await db.execute(
        select(models.TranscriptSegment).where(
            models.TranscriptSegment.meeting_id == meeting_id,
            models.TranscriptSegment.segment_index > seg.segment_index,
        )
    )
    for s in all_after.scalars():
        s.segment_index += 1

    # Trim original and create the new second half
    original_end = seg.end_time
    seg.end_time = body.split_at_time
    seg.is_edited = True

    new_seg = models.TranscriptSegment(
        meeting_id=meeting_id,
        speaker_id=seg.speaker_id,
        segment_index=seg.segment_index + 1,
        start_time=body.split_at_time,
        end_time=original_end,
        content="",  # user fills this in
        is_edited=True,
    )
    db.add(new_seg)
    await db.commit()

    result = await db.execute(
        select(models.TranscriptSegment)
        .where(models.TranscriptSegment.id.in_([seg.id, new_seg.id]))
        .options(selectinload(models.TranscriptSegment.speaker))
        .order_by(models.TranscriptSegment.segment_index)
    )
    return result.scalars().all()


@router.post("/meetings/{meeting_id}/transcript/merge", response_model=SegmentOut)
async def merge_segments(
    meeting_id: uuid.UUID,
    body: SegmentMerge,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Merge multiple adjacent segments into one."""
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.TranscriptSegment)
        .where(
            models.TranscriptSegment.id.in_(body.segment_ids),
            models.TranscriptSegment.meeting_id == meeting_id,
        )
        .order_by(models.TranscriptSegment.segment_index)
    )
    segs = result.scalars().all()

    if len(segs) < 2:
        raise HTTPException(status_code=422, detail="One or more segment IDs not found")

    # Merge into first segment
    first = segs[0]
    first.end_time = segs[-1].end_time
    first.content = " ".join(s.content for s in segs)
    first.is_edited = True
    first.edited_at = datetime.now(timezone.utc)

    # Delete the rest and reindex
    ids_to_delete = [s.id for s in segs[1:]]
    removed_count = len(ids_to_delete)
    pivot_index = first.segment_index

    for s in segs[1:]:
        await db.delete(s)

    # Shift down all segments after the merged block
    after_result = await db.execute(
        select(models.TranscriptSegment).where(
            models.TranscriptSegment.meeting_id == meeting_id,
            models.TranscriptSegment.segment_index > pivot_index + removed_count,
        )
    )
    for s in after_result.scalars():
        s.segment_index -= removed_count

    await db.commit()
    await db.refresh(first)
    return first


# ── Helper ─────────────────────────────────────────────────────────────────
async def _assert_meeting_owner(db, meeting_id, user_id):
    result = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meeting not found")

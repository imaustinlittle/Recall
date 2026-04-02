import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.transcript import SpeakerOut, SpeakerUpdate, SpeakerMerge

router = APIRouter()


@router.get("/meetings/{meeting_id}/speakers", response_model=list[SpeakerOut])
async def list_speakers(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_owner(db, meeting_id, current_user.id)
    result = await db.execute(
        select(models.Speaker)
        .where(models.Speaker.meeting_id == meeting_id)
        .order_by(models.Speaker.created_at)
    )
    return result.scalars().all()


@router.patch("/meetings/{meeting_id}/speakers/{speaker_id}", response_model=SpeakerOut)
async def update_speaker(
    meeting_id: uuid.UUID,
    speaker_id: uuid.UUID,
    body: SpeakerUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.Speaker).where(
            models.Speaker.id == speaker_id,
            models.Speaker.meeting_id == meeting_id,
        )
    )
    speaker = result.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(speaker, field, value)

    await db.commit()
    await db.refresh(speaker)
    return speaker


@router.post("/meetings/{meeting_id}/speakers/merge", response_model=SpeakerOut)
async def merge_speakers(
    meeting_id: uuid.UUID,
    body: SpeakerMerge,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Reassign all segments from source_id to target_id, then delete source."""
    await _assert_owner(db, meeting_id, current_user.id)

    # Verify both speakers belong to this meeting
    for sid in (body.source_id, body.target_id):
        r = await db.execute(
            select(models.Speaker).where(
                models.Speaker.id == sid,
                models.Speaker.meeting_id == meeting_id,
            )
        )
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Speaker {sid} not found")

    # Reassign segments
    await db.execute(
        update(models.TranscriptSegment)
        .where(
            models.TranscriptSegment.speaker_id == body.source_id,
            models.TranscriptSegment.meeting_id == meeting_id,
        )
        .values(speaker_id=body.target_id)
    )

    # Delete source speaker
    r = await db.execute(
        select(models.Speaker).where(models.Speaker.id == body.source_id)
    )
    await db.delete(r.scalar_one())
    await db.commit()

    # Return updated target
    r = await db.execute(
        select(models.Speaker).where(models.Speaker.id == body.target_id)
    )
    return r.scalar_one()


# ── Helper ─────────────────────────────────────────────────────────────────
async def _assert_owner(db, meeting_id, user_id):
    r = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == user_id,
        )
    )
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meeting not found")

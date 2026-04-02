import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

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
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    q = select(models.Meeting).where(models.Meeting.user_id == current_user.id)
    if status:
        q = q.where(models.Meeting.status == status)
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

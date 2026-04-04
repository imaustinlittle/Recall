import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.note import NoteOut, NoteCreate, NoteUpdate

router = APIRouter()


async def _assert_meeting_owner(db: AsyncSession, meeting_id: uuid.UUID, user_id: uuid.UUID):
    result = await db.execute(
        select(models.Meeting).where(
            models.Meeting.id == meeting_id,
            models.Meeting.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Meeting not found")


@router.get("/meetings/{meeting_id}/notes", response_model=list[NoteOut])
async def list_notes(
    meeting_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.Note)
        .where(models.Note.meeting_id == meeting_id)
        .order_by(models.Note.created_at)
    )
    return result.scalars().all()


@router.post("/meetings/{meeting_id}/notes", response_model=NoteOut, status_code=201)
async def create_note(
    meeting_id: uuid.UUID,
    body: NoteCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    note = models.Note(
        meeting_id=meeting_id,
        user_id=current_user.id,
        note_type=body.note_type,
        body=body.body,
        timestamp_ref=body.timestamp_ref,
        is_action_item=body.note_type == models.NoteType.action_item,
        is_decision=body.note_type == models.NoteType.decision,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/meetings/{meeting_id}/notes/{note_id}", response_model=NoteOut)
async def update_note(
    meeting_id: uuid.UUID,
    note_id: uuid.UUID,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.Note).where(
            models.Note.id == note_id,
            models.Note.meeting_id == meeting_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(note, field, value)

    # Keep boolean flags in sync with note_type
    if "note_type" in updates:
        note.is_action_item = note.note_type == models.NoteType.action_item
        note.is_decision = note.note_type == models.NoteType.decision

    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/meetings/{meeting_id}/notes/{note_id}", status_code=204)
async def delete_note(
    meeting_id: uuid.UUID,
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    await _assert_meeting_owner(db, meeting_id, current_user.id)

    result = await db.execute(
        select(models.Note).where(
            models.Note.id == note_id,
            models.Note.meeting_id == meeting_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    await db.delete(note)
    await db.commit()

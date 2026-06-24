import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.folder import FolderCreate, FolderUpdate, FolderOut

router = APIRouter()


@router.get("/folders", response_model=list[FolderOut])
async def list_folders(
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """List the user's folders with a live meeting count per folder."""
    result = await db.execute(
        select(
            models.Folder,
            func.count(models.Meeting.id).label("meeting_count"),
        )
        .outerjoin(models.Meeting, models.Meeting.folder_id == models.Folder.id)
        .where(models.Folder.user_id == current_user.id)
        .group_by(models.Folder.id)
        .order_by(models.Folder.name)
    )
    out: list[FolderOut] = []
    for folder, count in result.all():
        item = FolderOut.model_validate(folder)
        item.meeting_count = count
        out.append(item)
    return out


@router.post("/folders", response_model=FolderOut, status_code=201)
async def create_folder(
    body: FolderCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    folder = models.Folder(user_id=current_user.id, **body.model_dump())
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderOut.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=FolderOut)
async def update_folder(
    folder_id: uuid.UUID,
    body: FolderUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    folder = await _get_owned_folder(db, folder_id, current_user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(folder, field, value)
    await db.commit()
    await db.refresh(folder)
    return FolderOut.model_validate(folder)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a folder. Meetings inside are unfiled (folder_id → NULL), not deleted."""
    folder = await _get_owned_folder(db, folder_id, current_user.id)
    await db.delete(folder)
    await db.commit()


# ── Helper ─────────────────────────────────────────────────────────────────
async def _get_owned_folder(
    db: AsyncSession, folder_id: uuid.UUID, user_id: uuid.UUID
) -> models.Folder:
    result = await db.execute(
        select(models.Folder).where(
            models.Folder.id == folder_id,
            models.Folder.user_id == user_id,
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder

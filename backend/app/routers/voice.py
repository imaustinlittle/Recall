"""
Voice profile management — recognize speakers across meetings.

  GET    /api/voice-profiles            — list the user's profiles
  POST   /api/voice-profiles            — enroll/extend a profile from a speaker
  PATCH  /api/voice-profiles/{id}       — rename
  DELETE /api/voice-profiles/{id}       — delete

Enrollment copies a diarized speaker's voice embedding into a profile. Saving a
speaker whose name matches an existing profile averages the new sample in.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_async_db
from app.deps import get_current_user
from app import models
from app.schemas.voice import VoiceProfileOut, VoiceProfileCreate, VoiceProfileUpdate

router = APIRouter()


@router.get("/voice-profiles", response_model=list[VoiceProfileOut])
async def list_voice_profiles(
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(models.VoiceProfile)
        .where(models.VoiceProfile.user_id == current_user.id)
        .order_by(models.VoiceProfile.name)
    )).scalars().all()
    return rows


@router.post("/voice-profiles", response_model=VoiceProfileOut, status_code=201)
async def enroll_voice_profile(
    body: VoiceProfileCreate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    # Resolve the speaker and verify ownership via its meeting.
    speaker = (await db.execute(
        select(models.Speaker)
        .join(models.Meeting, models.Speaker.meeting_id == models.Meeting.id)
        .where(
            models.Speaker.id == body.speaker_id,
            models.Meeting.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
    if speaker.embedding is None:
        raise HTTPException(
            status_code=422,
            detail="This speaker has no voice embedding. Enable diarization and "
                   "re-transcribe to capture voice data.",
        )

    new_vec = _to_list(speaker.embedding)

    # Merge into an existing same-named profile, or create a new one.
    existing = (await db.execute(
        select(models.VoiceProfile).where(
            models.VoiceProfile.user_id == current_user.id,
            func.lower(models.VoiceProfile.name) == body.name.lower(),
        )
    )).scalar_one_or_none()

    if existing:
        existing.embedding = _running_average(
            _to_list(existing.embedding), existing.sample_count, new_vec
        )
        existing.sample_count += 1
        profile = existing
    else:
        profile = models.VoiceProfile(
            user_id=current_user.id,
            name=body.name,
            embedding=new_vec,
            sample_count=1,
        )
        db.add(profile)

    # Link + name this speaker to the profile.
    speaker.display_name = body.name
    await db.flush()
    speaker.voice_profile_id = profile.id

    await db.commit()
    await db.refresh(profile)
    return profile


@router.patch("/voice-profiles/{profile_id}", response_model=VoiceProfileOut)
async def rename_voice_profile(
    profile_id: uuid.UUID,
    body: VoiceProfileUpdate,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    profile = await _get_owned(db, profile_id, current_user.id)
    profile.name = body.name
    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/voice-profiles/{profile_id}", status_code=204)
async def delete_voice_profile(
    profile_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
    current_user: models.User = Depends(get_current_user),
):
    profile = await _get_owned(db, profile_id, current_user.id)
    await db.delete(profile)
    await db.commit()


# ── Helpers ─────────────────────────────────────────────────────────────────

def _to_list(vec) -> list[float]:
    """pgvector may hand back a numpy array or a list; normalize to list[float]."""
    return [float(x) for x in vec]


def _running_average(old: list[float], n: int, new: list[float]) -> list[float]:
    """Incremental mean: (old*n + new) / (n+1)."""
    if len(old) != len(new):
        return new
    return [(o * n + v) / (n + 1) for o, v in zip(old, new)]


async def _get_owned(db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID):
    profile = (await db.execute(
        select(models.VoiceProfile).where(
            models.VoiceProfile.id == profile_id,
            models.VoiceProfile.user_id == user_id,
        )
    )).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    return profile

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SpeakerOut(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    label: str
    display_name: Optional[str]
    color_hex: str
    avatar_url: Optional[str]

    model_config = {"from_attributes": True}


class SpeakerUpdate(BaseModel):
    display_name: Optional[str] = None
    color_hex: Optional[str] = None


class SpeakerMerge(BaseModel):
    source_id: uuid.UUID   # speaker to absorb
    target_id: uuid.UUID   # speaker to keep


class SegmentOut(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    speaker_id: Optional[uuid.UUID]
    speaker: Optional[SpeakerOut]
    segment_index: int
    start_time: float
    end_time: float
    content: str
    confidence: Optional[float]
    is_edited: bool
    edited_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SegmentUpdate(BaseModel):
    content: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    speaker_id: Optional[uuid.UUID] = None


class SegmentSplit(BaseModel):
    segment_id: uuid.UUID
    split_at_time: float   # seconds — must be between start_time and end_time


class SegmentMerge(BaseModel):
    segment_ids: list[uuid.UUID]   # must be adjacent; will merge in index order

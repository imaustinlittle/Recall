import re
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_MAX_CONTENT = 50_000
_MAX_MERGE_SEGMENTS = 500


class SpeakerOut(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    label: str
    display_name: Optional[str]
    color_hex: str
    avatar_url: Optional[str]
    voice_profile_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}


class SpeakerUpdate(BaseModel):
    display_name: Optional[str] = None
    color_hex: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) > 120:
                raise ValueError("Display name must be 120 characters or fewer")
        return v

    @field_validator("color_hex")
    @classmethod
    def validate_color_hex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX_RE.match(v):
            raise ValueError("color_hex must be a valid 6-digit hex color, e.g. #a1b2c3")
        return v


class SpeakerMerge(BaseModel):
    source_id: uuid.UUID   # speaker to absorb
    target_id: uuid.UUID   # speaker to keep

    @field_validator("target_id")
    @classmethod
    def ids_must_differ(cls, v: uuid.UUID, info) -> uuid.UUID:
        if "source_id" in info.data and v == info.data["source_id"]:
            raise ValueError("source_id and target_id must be different")
        return v


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

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > _MAX_CONTENT:
            raise ValueError(f"Content must be {_MAX_CONTENT:,} characters or fewer")
        return v

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("Time values must be non-negative")
        return v


class SegmentSplit(BaseModel):
    segment_id: uuid.UUID
    split_at_time: float

    @field_validator("split_at_time")
    @classmethod
    def validate_split_time(cls, v: float) -> float:
        if v < 0:
            raise ValueError("split_at_time must be non-negative")
        return v


class SegmentMerge(BaseModel):
    segment_ids: list[uuid.UUID]

    @field_validator("segment_ids")
    @classmethod
    def validate_segment_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) < 2:
            raise ValueError("Need at least 2 segments to merge")
        if len(v) > _MAX_MERGE_SEGMENTS:
            raise ValueError(f"Cannot merge more than {_MAX_MERGE_SEGMENTS} segments at once")
        if len(v) != len(set(v)):
            raise ValueError("segment_ids must be unique")
        return v

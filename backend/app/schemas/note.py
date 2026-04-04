import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

from app.models.note import NoteType

_MAX_BODY = 10_000


class NoteOut(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    user_id: uuid.UUID
    note_type: NoteType
    body: str
    timestamp_ref: Optional[float]
    is_action_item: bool
    is_decision: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteCreate(BaseModel):
    note_type: NoteType = NoteType.general
    body: str
    timestamp_ref: Optional[float] = None

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Note body cannot be empty")
        if len(v) > _MAX_BODY:
            raise ValueError(f"Note body must be {_MAX_BODY:,} characters or fewer")
        return v

    @field_validator("timestamp_ref")
    @classmethod
    def validate_timestamp(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("timestamp_ref must be non-negative")
        return v


class NoteUpdate(BaseModel):
    note_type: Optional[NoteType] = None
    body: Optional[str] = None
    timestamp_ref: Optional[float] = None

    @field_validator("body")
    @classmethod
    def validate_body(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Note body cannot be empty")
            if len(v) > _MAX_BODY:
                raise ValueError(f"Note body must be {_MAX_BODY:,} characters or fewer")
        return v

    @field_validator("timestamp_ref")
    @classmethod
    def validate_timestamp(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < 0:
            raise ValueError("timestamp_ref must be non-negative")
        return v

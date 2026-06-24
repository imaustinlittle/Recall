import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class VoiceProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    sample_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceProfileCreate(BaseModel):
    """Enroll a voice profile from an existing meeting speaker."""
    speaker_id: uuid.UUID
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be empty")
        if len(v) > 120:
            raise ValueError("Name must be 120 characters or fewer")
        return v


class VoiceProfileUpdate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name must not be empty")
        if len(v) > 120:
            raise ValueError("Name must be 120 characters or fewer")
        return v

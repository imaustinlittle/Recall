import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from app.models.meeting import MeetingStatus

_MAX_TAGS = 50
_MAX_TAG_LEN = 100


class MeetingCreate(BaseModel):
    title: str = "Untitled meeting"
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    recorded_at: Optional[datetime] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title must not be empty")
        if len(v) > 500:
            raise ValueError("Title must be 500 characters or fewer")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if len(v) > 10_000:
                raise ValueError("Description must be 10,000 characters or fewer")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is not None:
            if len(v) > _MAX_TAGS:
                raise ValueError(f"Cannot have more than {_MAX_TAGS} tags")
            for tag in v:
                if len(tag) > _MAX_TAG_LEN:
                    raise ValueError(f"Each tag must be {_MAX_TAG_LEN} characters or fewer")
        return v


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    recorded_at: Optional[datetime] = None
    calendar_event_id: Optional[uuid.UUID] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Title must not be empty")
            if len(v) > 500:
                raise ValueError("Title must be 500 characters or fewer")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 10_000:
            raise ValueError("Description must be 10,000 characters or fewer")
        return v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is not None:
            if len(v) > _MAX_TAGS:
                raise ValueError(f"Cannot have more than {_MAX_TAGS} tags")
            for tag in v:
                if len(tag) > _MAX_TAG_LEN:
                    raise ValueError(f"Each tag must be {_MAX_TAG_LEN} characters or fewer")
        return v


class MeetingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    status: MeetingStatus
    description: Optional[str]
    tags: Optional[list]
    recorded_at: Optional[datetime]
    summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MeetingListOut(BaseModel):
    items: list[MeetingOut]
    total: int
    page: int
    limit: int

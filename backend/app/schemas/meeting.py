import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.meeting import MeetingStatus


class MeetingCreate(BaseModel):
    title: str = "Untitled meeting"
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    recorded_at: Optional[datetime] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    recorded_at: Optional[datetime] = None
    calendar_event_id: Optional[uuid.UUID] = None


class MeetingOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    status: MeetingStatus
    description: Optional[str]
    tags: Optional[list]
    recorded_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MeetingListOut(BaseModel):
    items: list[MeetingOut]
    total: int
    page: int
    limit: int

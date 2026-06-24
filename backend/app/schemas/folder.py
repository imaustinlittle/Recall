import uuid
import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class FolderCreate(BaseModel):
    name: str
    color_hex: str = "#6366f1"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Folder name must not be empty")
        if len(v) > 120:
            raise ValueError("Folder name must be 120 characters or fewer")
        return v

    @field_validator("color_hex")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if not _HEX_RE.match(v):
            raise ValueError("color_hex must be a #RRGGBB hex string")
        return v.lower()


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    color_hex: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Folder name must not be empty")
            if len(v) > 120:
                raise ValueError("Folder name must be 120 characters or fewer")
        return v

    @field_validator("color_hex")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX_RE.match(v):
            raise ValueError("color_hex must be a #RRGGBB hex string")
        return v.lower() if v else v


class FolderOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    color_hex: str
    created_at: datetime
    meeting_count: int = 0

    model_config = {"from_attributes": True}

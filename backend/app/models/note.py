import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, Float, Boolean, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class NoteType(str, enum.Enum):
    general = "general"
    action_item = "action_item"
    decision = "decision"
    question = "question"


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    note_type: Mapped[NoteType] = mapped_column(
        Enum(NoteType), default=NoteType.general, nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional link back to a position in the audio
    timestamp_ref: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_action_item: Mapped[bool] = mapped_column(Boolean, default=False)
    is_decision: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meeting: Mapped["Meeting"] = relationship(back_populates="notes")
    user: Mapped["User"] = relationship()

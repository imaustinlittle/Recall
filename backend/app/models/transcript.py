import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Text, Float, Boolean, Integer, DateTime, ForeignKey, Index, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import text
from app.database import Base


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("speakers.id", ondelete="SET NULL"), nullable=True
    )
    # Stable ordering key — use this instead of start_time for ordering
    # so that split/merge operations don't break sort order
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    meeting: Mapped["Meeting"] = relationship(back_populates="segments")
    speaker: Mapped[Optional["Speaker"]] = relationship(back_populates="segments")

    __table_args__ = (
        # GIN index for full-text search across all transcripts
        Index(
            "ix_transcript_segments_fts",
            text("to_tsvector('english', content)"),
            postgresql_using="gin",
        ),
        # Composite index for ordered segment retrieval
        Index(
            "ix_transcript_segments_meeting_index",
            "meeting_id",
            "segment_index",
        ),
    )

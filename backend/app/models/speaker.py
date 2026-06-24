import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from app.database import Base

# Must match models.voice.VOICE_EMBED_DIM (pyannote/embedding → 512)
_SPEAKER_EMBED_DIM = 512


class Speaker(Base):
    __tablename__ = "speakers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    # Raw label from diarization, e.g. "SPEAKER_00"
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    # Human-readable name set by the user, e.g. "Alice"
    display_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    color_hex: Mapped[str] = mapped_column(String(7), default="#6366f1")
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Voice embedding (only set when diarization runs). Used to auto-match this
    # speaker to a saved VoiceProfile across meetings.
    embedding: Mapped[Optional[list[float]]] = mapped_column(
        Vector(_SPEAKER_EMBED_DIM), nullable=True
    )
    voice_profile_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("voice_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    meeting: Mapped["Meeting"] = relationship(back_populates="speakers")
    segments: Mapped[list["TranscriptSegment"]] = relationship(back_populates="speaker")

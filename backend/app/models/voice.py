import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from app.database import Base

# Speaker-embedding dimensionality. Must match the pyannote embedding model.
#   pyannote/embedding → 512
VOICE_EMBED_DIM = 512


class VoiceProfile(Base):
    """
    A known person, identified by a voice embedding, used to auto-label
    speakers across meetings. Enrolled by saving a meeting's speaker.
    """
    __tablename__ = "voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(VOICE_EMBED_DIM), nullable=False)
    # How many enrolled samples are averaged into `embedding`.
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_voice_profiles_user", "user_id"),
    )

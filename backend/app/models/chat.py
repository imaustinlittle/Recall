import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import Text, Float, Integer, DateTime, ForeignKey, Enum, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from app.database import Base

# Embedding dimensionality. Must match OLLAMA_EMBED_MODEL.
#   nomic-embed-text → 768
# Changing this requires a migration + re-indexing all meetings.
EMBED_DIM = 768


class TranscriptChunk(Base):
    """
    A retrieval unit for transcript chat: several consecutive transcript
    segments grouped into a ~window of text, with a vector embedding.
    """
    __tablename__ = "transcript_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    meeting: Mapped["Meeting"] = relationship()

    __table_args__ = (
        Index("ix_transcript_chunks_meeting_index", "meeting_id", "chunk_index"),
    )


class ChatRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class ChatMessage(Base):
    """One message in a meeting's chat thread (one thread per meeting)."""
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    meeting_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ChatRole] = mapped_column(Enum(ChatRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # For assistant messages: [{"start_time": float, "snippet": str}, ...]
    citations: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    __table_args__ = (
        Index("ix_chat_messages_meeting_created", "meeting_id", "created_at"),
    )

"""Transcript chat / RAG: pgvector extension, transcript_chunks, chat_messages

Revision ID: 006_chat_rag
Revises: 005_retention
Create Date: 2026-06-24
"""
from alembic import op

revision = "006_chat_rag"
down_revision = "005_retention"
branch_labels = None
depends_on = None

# Keep in sync with models.chat.EMBED_DIM
EMBED_DIM = 768


def upgrade() -> None:
    # pgvector extension (image is pgvector/pgvector:pg16)
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # chatrole enum (idempotent)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE chatrole AS ENUM ('user','assistant');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS transcript_chunks (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL,
            embedding vector({EMBED_DIM}) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transcript_chunks_meeting_index
        ON transcript_chunks (meeting_id, chunk_index)
    """)
    # Approximate-NN index for cosine distance. ivfflat needs ANALYZE/data to be
    # effective but is valid to create empty; lists tuned for a personal-scale set.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transcript_chunks_embedding
        ON transcript_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role chatrole NOT NULL,
            content TEXT NOT NULL,
            citations JSONB,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chat_messages_meeting_created
        ON chat_messages (meeting_id, created_at)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_chat_messages_meeting_created")
    op.execute("DROP TABLE IF EXISTS chat_messages")
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_embedding")
    op.execute("DROP INDEX IF EXISTS ix_transcript_chunks_meeting_index")
    op.execute("DROP TABLE IF EXISTS transcript_chunks")
    op.execute("DROP TYPE IF EXISTS chatrole")
    # Leave the `vector` extension installed — other features may use it.

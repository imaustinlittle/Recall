"""Voice profiles: voice_profiles table + speakers.embedding/voice_profile_id

Revision ID: 007_voice_profiles
Revises: 006_chat_rag
Create Date: 2026-06-24
"""
from alembic import op

revision = "007_voice_profiles"
down_revision = "006_chat_rag"
branch_labels = None
depends_on = None

# Keep in sync with models.voice.VOICE_EMBED_DIM
VOICE_DIM = 512


def upgrade() -> None:
    # vector extension was created in 006; ensure present for standalone runs.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS voice_profiles (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            embedding vector({VOICE_DIM}) NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_voice_profiles_user ON voice_profiles (user_id)")

    op.execute(f"ALTER TABLE speakers ADD COLUMN IF NOT EXISTS embedding vector({VOICE_DIM})")
    op.execute("""
        ALTER TABLE speakers
        ADD COLUMN IF NOT EXISTS voice_profile_id UUID
        REFERENCES voice_profiles(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE speakers DROP COLUMN IF EXISTS voice_profile_id")
    op.execute("ALTER TABLE speakers DROP COLUMN IF EXISTS embedding")
    op.execute("DROP INDEX IF EXISTS ix_voice_profiles_user")
    op.execute("DROP TABLE IF EXISTS voice_profiles")

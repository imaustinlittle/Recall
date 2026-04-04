"""Initial schema — all tables including app_settings

Revision ID: 001_initial
Revises:
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None

# Pre-built ENUM references — create_type=False means SQLAlchemy will never
# emit CREATE TYPE for these; the DO $$ blocks below handle creation safely.
_meeting_status = postgresql.ENUM(
    "pending", "uploading", "queued", "processing", "transcribed", "failed",
    name="meetingstatus", create_type=False,
)
_job_status = postgresql.ENUM(
    "queued", "processing", "completed", "failed", "cancelled",
    name="jobstatus", create_type=False,
)
_job_type = postgresql.ENUM(
    "transcription", "diarization", "export",
    name="jobtype", create_type=False,
)
_note_type = postgresql.ENUM(
    "general", "action_item", "decision", "question",
    name="notetype", create_type=False,
)


def upgrade() -> None:
    # ── Enum types (idempotent) ────────────────────────────────────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE meetingstatus AS ENUM ('pending','uploading','queued','processing','transcribed','failed');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE jobstatus AS ENUM ('queued','processing','completed','failed','cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE jobtype AS ENUM ('transcription','diarization','export');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notetype AS ENUM ('general','action_item','decision','question');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── users ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT '',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")

    # ── calendar_events ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider VARCHAR(30) NOT NULL DEFAULT 'google',
            external_id VARCHAR(500) NOT NULL,
            title VARCHAR(500) NOT NULL,
            attendees JSONB,
            start_time TIMESTAMPTZ,
            end_time TIMESTAMPTZ,
            synced_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── meetings ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
            title VARCHAR(500) NOT NULL DEFAULT 'Untitled meeting',
            status meetingstatus NOT NULL DEFAULT 'pending',
            description TEXT,
            tags JSONB,
            recorded_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_meetings_status ON meetings (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_meetings_created_at ON meetings (created_at)")

    # ── media_files ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS media_files (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            file_path VARCHAR(1000) NOT NULL,
            original_filename VARCHAR(500) NOT NULL,
            mime_type VARCHAR(120),
            file_size_bytes INTEGER,
            duration_seconds INTEGER,
            storage_backend VARCHAR(20) NOT NULL DEFAULT 'local',
            uploaded_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── speakers ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS speakers (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            label VARCHAR(50) NOT NULL,
            display_name VARCHAR(120),
            color_hex VARCHAR(7) NOT NULL DEFAULT '#6366f1',
            avatar_url VARCHAR(500),
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── transcript_segments ────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS transcript_segments (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            speaker_id UUID REFERENCES speakers(id) ON DELETE SET NULL,
            segment_index INTEGER NOT NULL,
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL,
            content TEXT NOT NULL,
            confidence FLOAT,
            is_edited BOOLEAN NOT NULL DEFAULT FALSE,
            edited_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transcript_segments_meeting_index
        ON transcript_segments (meeting_id, segment_index)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_transcript_segments_fts
        ON transcript_segments
        USING gin(to_tsvector('english', content))
    """)

    # ── notes ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            note_type notetype NOT NULL DEFAULT 'general',
            body TEXT NOT NULL,
            timestamp_ref FLOAT,
            is_action_item BOOLEAN NOT NULL DEFAULT FALSE,
            is_decision BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── jobs ───────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id UUID PRIMARY KEY,
            meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            celery_task_id VARCHAR(200),
            job_type jobtype NOT NULL DEFAULT 'transcription',
            status jobstatus NOT NULL DEFAULT 'queued',
            progress FLOAT NOT NULL DEFAULT 0,
            message VARCHAR(500),
            error_info JSONB,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_jobs_celery_task_id ON jobs (celery_task_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs (status)")

    # ── app_settings ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("jobs")
    op.drop_table("notes")
    op.execute("DROP INDEX IF EXISTS ix_transcript_segments_fts")
    op.execute("DROP INDEX IF EXISTS ix_transcript_segments_meeting_index")
    op.drop_table("transcript_segments")
    op.drop_table("speakers")
    op.drop_table("media_files")
    op.execute("DROP INDEX IF EXISTS ix_meetings_created_at")
    op.execute("DROP INDEX IF EXISTS ix_meetings_status")
    op.drop_table("meetings")
    op.drop_table("calendar_events")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS notetype")
    op.execute("DROP TYPE IF EXISTS jobtype")
    op.execute("DROP TYPE IF EXISTS jobstatus")
    op.execute("DROP TYPE IF EXISTS meetingstatus")

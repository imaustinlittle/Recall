"""Add folders and meetings.folder_id

Revision ID: 004_folders
Revises: 003_add_summary
Create Date: 2026-06-24
"""
from alembic import op

revision = "004_folders"
down_revision = "003_add_summary"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS folders (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            color_hex VARCHAR(7) NOT NULL DEFAULT '#6366f1',
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_folders_user_id ON folders (user_id)")

    op.execute("""
        ALTER TABLE meetings
        ADD COLUMN IF NOT EXISTS folder_id UUID
        REFERENCES folders(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_meetings_folder_id ON meetings (folder_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_meetings_folder_id")
    op.execute("ALTER TABLE meetings DROP COLUMN IF EXISTS folder_id")
    op.execute("DROP INDEX IF EXISTS ix_folders_user_id")
    op.execute("DROP TABLE IF EXISTS folders")

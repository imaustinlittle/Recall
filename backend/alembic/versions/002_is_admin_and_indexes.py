"""Add is_admin to users; add indexes on meeting.user_id and media_files.meeting_id

Revision ID: 002_is_admin_and_indexes
Revises: 001_initial
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa

revision = "002_is_admin_and_indexes"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index("ix_meetings_user_id", "meetings", ["user_id"])
    op.create_index("ix_media_files_meeting_id", "media_files", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_media_files_meeting_id", table_name="media_files")
    op.drop_index("ix_meetings_user_id", table_name="meetings")
    op.drop_column("users", "is_admin")

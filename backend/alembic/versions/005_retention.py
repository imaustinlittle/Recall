"""Add meetings.retention_exempt

Revision ID: 005_retention
Revises: 004_folders
Create Date: 2026-06-24
"""
from alembic import op

revision = "005_retention"
down_revision = "004_folders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE meetings
        ADD COLUMN IF NOT EXISTS retention_exempt BOOLEAN NOT NULL DEFAULT FALSE
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE meetings DROP COLUMN IF EXISTS retention_exempt")

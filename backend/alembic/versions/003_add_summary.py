"""Add summary column to meetings

Revision ID: 003_add_summary
Revises: 002_is_admin_and_indexes
Create Date: 2026-04-04
"""
from alembic import op
import sqlalchemy as sa

revision = "003_add_summary"
down_revision = "002_is_admin_and_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "summary")

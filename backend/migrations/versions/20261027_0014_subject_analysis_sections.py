"""Add extensible optional analysis sections to project subjects.

Revision ID: 20261027_0014
Revises: 20261027_0013
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0014"
down_revision = "20261027_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("research_subjects", sa.Column(
        "analysis_sections_json", sa.JSON(), server_default="[]", nullable=False,
    ))


def downgrade() -> None:
    op.drop_column("research_subjects", "analysis_sections_json")

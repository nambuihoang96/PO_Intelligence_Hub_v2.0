"""Add append-only source-attributed project trend updates.

Revision ID: 20261027_0012
Revises: 20261027_0011
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0012"
down_revision = "20261027_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_trend_updates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("collection_id", sa.String(length=36), nullable=True),
        sa.Column("exact_claim", sa.Text(), nullable=False),
        sa.Column("source_note", sa.Text(), nullable=False),
        sa.Column("source_title", sa.String(length=500), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("published_on", sa.Date(), nullable=False),
        sa.Column("source_status", sa.String(length=40), server_default="source_reported_unverified", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_status = 'source_reported_unverified'", name="ck_project_trend_updates_unverified"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                                name="fk_project_trend_updates_project"),
        sa.ForeignKeyConstraint(["project_id", "subject_id"], ["research_subjects.project_id", "research_subjects.id"],
                                ondelete="RESTRICT", name="fk_project_trend_updates_subject"),
        sa.ForeignKeyConstraint(["project_id", "collection_id"], ["research_benchmark_collections.project_id", "research_benchmark_collections.id"],
                                ondelete="RESTRICT", name="fk_project_trend_updates_collection"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_trend_updates_project_published", "project_trend_updates",
                    ["project_id", "published_on", "created_at"])
    op.create_index("ix_project_trend_updates_collection_subject", "project_trend_updates",
                    ["project_id", "collection_id", "subject_id"])


def downgrade() -> None:
    op.drop_index("ix_project_trend_updates_collection_subject", table_name="project_trend_updates")
    op.drop_index("ix_project_trend_updates_project_published", table_name="project_trend_updates")
    op.drop_table("project_trend_updates")

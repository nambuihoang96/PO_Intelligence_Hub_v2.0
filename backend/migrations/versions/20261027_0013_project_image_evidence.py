"""Store project-scoped image evidence and source attribution.

Revision ID: 20261027_0013
Revises: 20261027_0012
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0013"
down_revision = "20261027_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("uq_project_trend_updates_project_subject_id", "project_trend_updates",
                    ["project_id", "subject_id", "id"], unique=True)
    op.create_table(
        "project_image_evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("trend_update_id", sa.String(length=36), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("content_size", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("source_note", sa.Text(), nullable=False),
        sa.Column("source_title", sa.String(length=500), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("published_on", sa.Date(), nullable=True),
        sa.Column("source_status", sa.String(length=40), server_default="source_reported_unverified", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_status = 'source_reported_unverified'", name="ck_project_image_evidence_unverified"),
        sa.CheckConstraint("content_type IN ('image/jpeg','image/png','image/webp')", name="ck_project_image_evidence_type"),
        sa.CheckConstraint("content_size > 0 AND content_size <= 10485760", name="ck_project_image_evidence_size"),
        sa.CheckConstraint("length(content_sha256) = 64", name="ck_project_image_evidence_sha_length"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                                name="fk_project_image_evidence_project"),
        sa.ForeignKeyConstraint(["project_id", "subject_id"], ["research_subjects.project_id", "research_subjects.id"],
                                ondelete="RESTRICT", name="fk_project_image_evidence_subject"),
        sa.ForeignKeyConstraint(["project_id", "subject_id", "trend_update_id"],
                                ["project_trend_updates.project_id", "project_trend_updates.subject_id", "project_trend_updates.id"],
                                ondelete="RESTRICT",
                                name="fk_project_image_evidence_trend_update"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_image_evidence_subject_created", "project_image_evidence", ["project_id", "subject_id", "created_at"])
    op.create_index("ix_project_image_evidence_trend_update", "project_image_evidence", ["trend_update_id"])


def downgrade() -> None:
    op.drop_index("ix_project_image_evidence_trend_update", table_name="project_image_evidence")
    op.drop_index("ix_project_image_evidence_subject_created", table_name="project_image_evidence")
    op.drop_table("project_image_evidence")
    op.drop_index("uq_project_trend_updates_project_subject_id", table_name="project_trend_updates")

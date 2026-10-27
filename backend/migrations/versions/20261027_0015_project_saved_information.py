"""Add project-level source information that can be saved before subject confirmation.

Revision ID: 20261027_0015
Revises: 20261027_0014
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0015"
down_revision = "20261027_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_saved_information",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=True),
        sa.Column("collection_id", sa.String(length=36), nullable=True),
        sa.Column("original_content", sa.Text(), nullable=False),
        sa.Column("source_context", sa.Text(), nullable=True),
        sa.Column("source_title", sa.String(length=500), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("captured_on", sa.Date(), nullable=True),
        sa.Column("image_filename", sa.String(length=255), nullable=True),
        sa.Column("image_content_type", sa.String(length=32), nullable=True),
        sa.Column("image_size", sa.Integer(), nullable=True),
        sa.Column("image_sha256", sa.String(length=64), nullable=True),
        sa.Column("image_content", sa.LargeBinary(), nullable=True),
        sa.Column("source_status", sa.String(length=40), server_default="source_reported_unverified", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_status = 'source_reported_unverified'", name="ck_project_saved_information_unverified"),
        sa.CheckConstraint("image_content IS NULL OR (image_size > 0 AND image_size <= 10485760)", name="ck_project_saved_information_image_size"),
        sa.CheckConstraint("image_content IS NULL OR length(image_sha256) = 64", name="ck_project_saved_information_image_sha_length"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT", name="fk_project_saved_information_project"),
        sa.ForeignKeyConstraint(["project_id", "subject_id"], ["research_subjects.project_id", "research_subjects.id"], ondelete="RESTRICT", name="fk_project_saved_information_subject"),
        sa.ForeignKeyConstraint(["project_id", "collection_id"], ["research_benchmark_collections.project_id", "research_benchmark_collections.id"], ondelete="RESTRICT", name="fk_project_saved_information_collection"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_saved_information_project_created", "project_saved_information", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_project_saved_information_project_created", table_name="project_saved_information")
    op.drop_table("project_saved_information")

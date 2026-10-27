"""Add project-owned research subjects and explicit source references.

Revision ID: 20261027_0010
Revises: 20261024_0009
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0010"
down_revision = "20261024_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_subjects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("subject_type", sa.String(length=120), nullable=True),
        sa.Column("aliases_json", sa.JSON(), nullable=False),
        sa.Column("external_ids_json", sa.JSON(), nullable=False),
        sa.Column("provenance_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                               name="fk_research_subjects_project"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "id", name="uq_research_subjects_project_id"),
    )
    op.create_index("ix_research_subjects_project_name", "research_subjects", ["project_id", "name"])

    op.create_table(
        "research_subject_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("source_kind", sa.String(length=24), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=False),
        sa.Column("source_key", sa.String(length=500), nullable=False),
        sa.Column("source_name", sa.String(length=500), nullable=False),
        sa.Column("provenance_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_kind IN ('report_entity','csv_entity')", name="ck_research_subject_refs_source_kind"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                               name="fk_research_subject_refs_project"),
        sa.ForeignKeyConstraint(["project_id", "subject_id"],
                                ["research_subjects.project_id", "research_subjects.id"],
                                ondelete="RESTRICT", name="fk_research_subject_refs_subject"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "source_kind", "source_id", "source_key",
                            name="uq_research_subject_refs_source_identity"),
    )
    op.create_index("ix_research_subject_refs_subject", "research_subject_references", ["project_id", "subject_id"])


def downgrade() -> None:
    op.drop_index("ix_research_subject_refs_subject", table_name="research_subject_references")
    op.drop_table("research_subject_references")
    op.drop_index("ix_research_subjects_project_name", table_name="research_subjects")
    op.drop_table("research_subjects")

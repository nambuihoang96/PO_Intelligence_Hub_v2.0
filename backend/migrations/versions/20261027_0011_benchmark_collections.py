"""Add project-owned benchmark collections of reusable subjects.

Revision ID: 20261027_0011
Revises: 20261027_0010
"""
from alembic import op
import sqlalchemy as sa


revision = "20261027_0011"
down_revision = "20261027_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_benchmark_collections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                                name="fk_research_benchmark_collections_project"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "id", name="uq_research_benchmark_collections_project_id"),
    )
    op.create_index("ix_research_benchmark_collections_project_name", "research_benchmark_collections", ["project_id", "name"])
    op.create_table(
        "research_benchmark_collection_members",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("collection_id", sa.String(length=36), nullable=False),
        sa.Column("subject_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "collection_id"],
                                ["research_benchmark_collections.project_id", "research_benchmark_collections.id"],
                                ondelete="RESTRICT", name="fk_research_benchmark_collection_member_collection"),
        sa.ForeignKeyConstraint(["project_id", "subject_id"],
                                ["research_subjects.project_id", "research_subjects.id"],
                                ondelete="RESTRICT", name="fk_research_benchmark_collection_member_subject"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("collection_id", "subject_id", name="uq_research_benchmark_collection_member"),
    )
    op.create_index("ix_research_benchmark_collection_members_project", "research_benchmark_collection_members", ["project_id", "collection_id"])


def downgrade() -> None:
    op.drop_index("ix_research_benchmark_collection_members_project", table_name="research_benchmark_collection_members")
    op.drop_table("research_benchmark_collection_members")
    op.drop_index("ix_research_benchmark_collections_project_name", table_name="research_benchmark_collections")
    op.drop_table("research_benchmark_collections")

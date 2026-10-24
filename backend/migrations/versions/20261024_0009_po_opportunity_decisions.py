"""Persist workspace-scoped PO opportunity decisions.

Revision ID: 20261024_0009
Revises: 20261023_0008
"""
from alembic import op
import sqlalchemy as sa


revision = "20261024_0009"
down_revision = "20261023_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "po_opportunity_decisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("candidate_id", sa.String(length=100), nullable=False),
        sa.Column("decision_json", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_po_opportunity_decisions_revision_positive"),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                                name="fk_po_opportunity_decisions_project"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "candidate_id", name="uq_po_opportunity_decisions_project_candidate"),
    )
    op.create_index("ix_po_opportunity_decisions_project_updated", "po_opportunity_decisions", ["project_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_po_opportunity_decisions_project_updated", table_name="po_opportunity_decisions")
    op.drop_table("po_opportunity_decisions")

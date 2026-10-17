"""Additive storage for user-imported ChatGPT reports."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0004"
down_revision: Union[str, None] = "20261017_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "imported_research_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("geo", sa.String(length=100), nullable=False),
        sa.Column("os", sa.String(length=20), nullable=False),
        sa.Column("research_period", sa.String(length=200), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("origin", sa.String(length=40), server_default="chatgpt_user_import", nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("origin = 'chatgpt_user_import'", name="ck_imported_research_reports_origin"),
        sa.PrimaryKeyConstraint("id", name="pk_imported_research_reports"),
        sa.UniqueConstraint("content_sha256", name="uq_imported_research_reports_content_sha256"),
    )
    op.create_index(
        "ix_imported_research_reports_imported_id",
        "imported_research_reports",
        ["imported_at", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_imported_research_reports_imported_id", table_name="imported_research_reports")
    op.drop_table("imported_research_reports")

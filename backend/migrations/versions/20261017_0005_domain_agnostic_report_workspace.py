"""Add extensible structured report data and PO benchmark selections."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0005"
down_revision: Union[str, None] = "20261017_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "imported_research_reports",
        sa.Column("research_data_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "imported_research_reports",
        sa.Column("parse_status", sa.String(length=32), nullable=False, server_default="NEEDS_STRUCTURING"),
    )
    op.add_column("imported_research_reports", sa.Column("extraction_error", sa.Text(), nullable=True))
    op.add_column(
        "imported_research_reports",
        sa.Column("benchmark_selections_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("imported_research_reports", "benchmark_selections_json")
    op.drop_column("imported_research_reports", "extraction_error")
    op.drop_column("imported_research_reports", "parse_status")
    op.drop_column("imported_research_reports", "research_data_json")

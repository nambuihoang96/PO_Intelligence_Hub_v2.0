"""Persist PO-owned benchmark workspace separately from imported research."""

from alembic import op
import sqlalchemy as sa


revision = "20261017_0006"
down_revision = "20261017_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.alter_column("os", existing_type=sa.String(length=20), type_=sa.String(length=100), nullable=False)
        batch.add_column(sa.Column("benchmark_workspace_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))


def downgrade() -> None:
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_column("benchmark_workspace_json")
        batch.alter_column("os", existing_type=sa.String(length=100), type_=sa.String(length=20), nullable=False)

"""Link a report to the CSV dataset and top-N games it refers to (additive, nullable)."""

from alembic import op
import sqlalchemy as sa


revision = "20261105_0020"
down_revision = "20261105_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.add_column(sa.Column("source_selection_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    # Drops only the optional link; report text, origin and assistant are unchanged.
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_column("source_selection_json")

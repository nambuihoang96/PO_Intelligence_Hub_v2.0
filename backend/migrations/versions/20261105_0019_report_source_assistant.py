"""Record which assistant wrote a pasted report (additive, nullable)."""

from alembic import op
import sqlalchemy as sa


revision = "20261105_0019"
down_revision = "20261105_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.add_column(sa.Column("source_assistant", sa.String(20), nullable=True))


def downgrade() -> None:
    # Drops only the optional assistant label; origin and every report are unchanged.
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_column("source_assistant")

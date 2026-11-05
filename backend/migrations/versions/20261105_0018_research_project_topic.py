"""Add an optional research topic to projects (additive, nullable)."""

from alembic import op
import sqlalchemy as sa


revision = "20261105_0018"
down_revision = "20261103_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("research_projects") as batch:
        batch.add_column(sa.Column("topic", sa.String(300), nullable=True))


def downgrade() -> None:
    # Dropping the column loses only the optional topic text; no other project data depends on it.
    with op.batch_alter_table("research_projects") as batch:
        batch.drop_column("topic")

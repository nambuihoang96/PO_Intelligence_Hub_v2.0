"""Persist the source report for a follow-up research import."""

from alembic import op
import sqlalchemy as sa


revision = "20261102_0016"
down_revision = "20261027_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    stale_table = "_alembic_tmp_imported_research_reports"
    if sa.inspect(bind).has_table(stale_table):
        stale_rows = bind.execute(sa.text(f"SELECT COUNT(*) FROM {stale_table}")).scalar_one()
        if stale_rows:
            raise RuntimeError(
                "A previous report migration left a temporary table containing rows. "
                "It was preserved; do not rerun migrations until that data is recovered."
            )
        op.drop_table(stale_table)

    with op.batch_alter_table("imported_research_reports") as batch:
        batch.add_column(sa.Column("previous_report_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("comparison_review_json", sa.JSON(), nullable=False, server_default="[]"))
        batch.create_foreign_key(
            "fk_imported_reports_previous_report",
            "imported_research_reports",
            ["previous_report_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    bind = op.get_bind()
    used_lineage = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM imported_research_reports "
            "WHERE previous_report_id IS NOT NULL OR comparison_review_json <> '[]'"
        )
    ).scalar_one()
    if used_lineage:
        raise RuntimeError("Cannot downgrade while report comparison lineage is in use; preserving user data.")
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_constraint("fk_imported_reports_previous_report", type_="foreignkey")
        batch.drop_column("comparison_review_json")
        batch.drop_column("previous_report_id")

"""Allow reports generated through the local Codex CLI to retain provenance."""

from alembic import op
import sqlalchemy as sa


revision = "20261103_0017"
down_revision = "20261102_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_constraint("ck_imported_research_reports_origin", type_="check")
        batch.create_check_constraint(
            "ck_imported_research_reports_origin",
            "origin IN ('chatgpt_user_import','codex_cli_research')",
        )


def downgrade() -> None:
    bind = op.get_bind()
    codex_reports = bind.execute(sa.text(
        "SELECT COUNT(*) FROM imported_research_reports WHERE origin = 'codex_cli_research'"
    )).scalar_one()
    if codex_reports:
        raise RuntimeError("Cannot downgrade while Codex-generated reports exist; preserving their provenance.")
    with op.batch_alter_table("imported_research_reports") as batch:
        batch.drop_constraint("ck_imported_research_reports_origin", type_="check")
        batch.create_check_constraint("ck_imported_research_reports_origin", "origin = 'chatgpt_user_import'")

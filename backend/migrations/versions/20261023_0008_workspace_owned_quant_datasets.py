"""Allow CSV datasets and imported reports to belong to a research workspace.

Revision ID: 20261023_0008
Revises: 20261020_0007
"""
from alembic import op
import sqlalchemy as sa


revision = "20261023_0008"
down_revision = "20261020_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep this in-place as well: imported reports are about to gain a
    # project reference, so replacing the parent table would violate SQLite's
    # enforced foreign keys when the database already contains report rows.
    op.execute("ALTER TABLE research_projects ADD COLUMN workspace_state_json JSON NOT NULL DEFAULT '{}'" )
    # SQLite can safely add this nullable foreign-key column in place. Avoid
    # batch-recreating reports because quantitative_datasets already references
    # that table and SQLite enforces the reference during DROP TABLE.
    op.execute(
        "ALTER TABLE imported_research_reports ADD COLUMN project_id VARCHAR(36) "
        "REFERENCES research_projects(id)"
    )
    with op.batch_alter_table("quantitative_datasets", recreate="always") as batch:
        batch.drop_constraint("uq_quant_datasets_report_hash", type_="unique")
        batch.alter_column("report_id", existing_type=sa.String(length=36), nullable=True)
        batch.add_column(sa.Column("project_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key(
            "fk_quant_datasets_project", "research_projects", ["project_id"], ["id"], ondelete="RESTRICT"
        )
        batch.create_unique_constraint("uq_quant_datasets_report_hash", ["report_id", "content_sha256"])
        batch.create_unique_constraint("uq_quant_datasets_project_hash", ["project_id", "content_sha256"])
        batch.create_check_constraint(
            "ck_quant_datasets_has_owner", "report_id IS NOT NULL OR project_id IS NOT NULL"
        )
    op.create_index("ix_quant_datasets_project_created", "quantitative_datasets", ["project_id", "created_at"])


def downgrade() -> None:
    bind = op.get_bind()
    dataset_count = bind.execute(sa.text("SELECT COUNT(*) FROM quantitative_datasets WHERE report_id IS NULL OR project_id IS NOT NULL")).scalar_one()
    report_count = bind.execute(sa.text("SELECT COUNT(*) FROM imported_research_reports WHERE project_id IS NOT NULL")).scalar_one()
    if dataset_count or report_count:
        raise RuntimeError("Cannot downgrade workspace-owned reports/datasets without orphaning user data.")
    op.drop_column("research_projects", "workspace_state_json")
    op.drop_index("ix_quant_datasets_project_created", table_name="quantitative_datasets")
    with op.batch_alter_table("quantitative_datasets", recreate="always") as batch:
        batch.drop_constraint("ck_quant_datasets_has_owner", type_="check")
        batch.drop_constraint("uq_quant_datasets_project_hash", type_="unique")
        batch.drop_constraint("uq_quant_datasets_report_hash", type_="unique")
        batch.drop_constraint("fk_quant_datasets_project", type_="foreignkey")
        batch.drop_column("project_id")
        batch.alter_column("report_id", existing_type=sa.String(length=36), nullable=False)
        batch.create_unique_constraint("uq_quant_datasets_report_hash", ["report_id", "content_sha256"])
    op.drop_column("imported_research_reports", "project_id")

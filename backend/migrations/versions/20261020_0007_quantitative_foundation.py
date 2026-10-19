"""Add report-linked quantitative dataset storage."""

from alembic import op
import sqlalchemy as sa


revision = "20261020_0007"
down_revision = "20261017_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quantitative_datasets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("report_id", sa.String(length=36), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("original_csv", sa.Text(), nullable=False),
        sa.Column("field_mapping_json", sa.JSON(), nullable=False),
        sa.Column("entity_mappings_json", sa.JSON(), nullable=False),
        sa.Column("observations_json", sa.JSON(), nullable=False),
        sa.Column("compatibility_status", sa.String(length=24), nullable=False),
        sa.Column("validation_reasons_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["imported_research_reports.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("report_id", "content_sha256", name="uq_quant_datasets_report_hash"),
        sa.CheckConstraint("compatibility_status IN ('compatible','partial','incompatible')", name="ck_quant_datasets_compatibility"),
    )
    op.create_index("ix_quant_datasets_report_created", "quantitative_datasets", ["report_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_quant_datasets_report_created", table_name="quantitative_datasets")
    op.drop_table("quantitative_datasets")

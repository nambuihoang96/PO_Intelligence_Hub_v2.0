"""Create the V2-002 local research metadata schema."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "research_projects",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("owner", sa.String(length=200), nullable=True),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_research_projects"),
    )
    op.create_table(
        "research_plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("geos", sa.JSON(), nullable=False),
        sa.Column("platforms", sa.JSON(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("comparison_period_start", sa.Date(), nullable=True),
        sa.Column("comparison_period_end", sa.Date(), nullable=True),
        sa.Column("goals", sa.JSON(), nullable=False),
        sa.Column("keywords", sa.JSON(), nullable=False),
        sa.Column("source_policy", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version >= 1", name="ck_research_plans_version_positive"),
        sa.CheckConstraint(
            "(period_start IS NULL AND period_end IS NULL) OR "
            "(period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)",
            name="ck_research_plans_period_valid",
        ),
        sa.CheckConstraint(
            "(comparison_period_start IS NULL AND comparison_period_end IS NULL) OR "
            "(comparison_period_start IS NOT NULL AND comparison_period_end IS NOT NULL AND "
            "comparison_period_start <= comparison_period_end)",
            name="ck_research_plans_comparison_period_valid",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT", name="fk_research_plans_project"),
        sa.PrimaryKeyConstraint("id", name="pk_research_plans"),
        sa.UniqueConstraint("project_id", "version", name="uq_research_plans_project_version"),
        sa.UniqueConstraint("project_id", "id", "version", name="uq_research_plans_project_id_version"),
    )
    op.create_table(
        "research_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("plan_version", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(length=32), server_default="queued", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("coverage_summary", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "state IN ('queued','collecting','validating','synthesizing','completed','completed_with_gaps','partial','failed','cancelled')",
            name="ck_research_runs_state",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "plan_id", "plan_version"],
            ["research_plans.project_id", "research_plans.id", "research_plans.version"],
            ondelete="RESTRICT",
            name="fk_research_runs_plan_version",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_research_runs"),
    )
    op.create_index("ix_research_runs_project_created", "research_runs", ["project_id", "created_at"])
    op.create_table(
        "source_registry",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("url_domain", sa.String(length=253), nullable=True),
        sa.Column("license_status", sa.String(length=24), server_default="unknown", nullable=False),
        sa.Column("collection_mode", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("rate_limit", sa.Integer(), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "license_status IN ('unknown','manual_only','approved','blocked','review_required')",
            name="ck_source_registry_license_status",
        ),
        sa.CheckConstraint("collection_mode IN ('manual','approved_adapter','import')", name="ck_source_registry_collection_mode"),
        sa.CheckConstraint(
            "enabled = 0 OR (license_status = 'approved' AND collection_mode = 'approved_adapter')",
            name="ck_source_registry_enabled_requires_approval",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_source_registry"),
    )
    op.create_table(
        "source_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("source_registry_id", sa.String(length=36), nullable=True),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("collection_mode", sa.String(length=32), server_default="manual", nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.CheckConstraint("collection_mode IN ('manual','approved_adapter','import')", name="ck_source_records_collection_mode"),
        sa.ForeignKeyConstraint(["run_id"], ["research_runs.id"], ondelete="RESTRICT", name="fk_source_records_run"),
        sa.ForeignKeyConstraint(["source_registry_id"], ["source_registry.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_source_records"),
        sa.UniqueConstraint("run_id", "id", name="uq_source_records_run_id"),
    )
    op.create_index("ix_source_records_run_retrieved", "source_records", ["run_id", "retrieved_at"])
    op.create_index("ix_source_records_registry", "source_records", ["source_registry_id"])
    op.create_table(
        "evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("source_record_id", sa.String(length=36), nullable=False),
        sa.Column("excerpt_or_ref", sa.Text(), nullable=False),
        sa.Column("method", sa.String(length=80), nullable=False),
        sa.Column("quality", sa.String(length=24), server_default="insufficient", nullable=False),
        sa.Column("status", sa.String(length=24), server_default="needs_review", nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quality IN ('observed','measured','estimated','inferred','insufficient')", name="ck_evidence_quality"),
        sa.CheckConstraint("status IN ('verified','needs_review','unsupported','rejected')", name="ck_evidence_status"),
        sa.ForeignKeyConstraint(
            ["run_id", "source_record_id"],
            ["source_records.run_id", "source_records.id"],
            ondelete="RESTRICT",
            name="fk_evidence_source_same_run",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_evidence"),
    )
    op.create_index("ix_evidence_run_created", "evidence", ["run_id", "created_at"])
    op.create_index("ix_evidence_source_record", "evidence", ["source_record_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_source_record", table_name="evidence")
    op.drop_index("ix_evidence_run_created", table_name="evidence")
    op.drop_table("evidence")
    op.drop_index("ix_source_records_registry", table_name="source_records")
    op.drop_index("ix_source_records_run_retrieved", table_name="source_records")
    op.drop_table("source_records")
    op.drop_table("source_registry")
    op.drop_index("ix_research_runs_project_created", table_name="research_runs")
    op.drop_table("research_runs")
    op.drop_table("research_plans")
    op.drop_table("research_projects")

"""Add immutable finalized run manifests and state transition guard."""

import hashlib
import json
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0002"
down_revision: Union[str, None] = "20261017_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "research_run_manifests",
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("version >= 1", name="ck_research_run_manifests_version_positive"),
        sa.CheckConstraint("length(checksum_sha256) = 64", name="ck_research_run_manifests_checksum_length"),
        sa.ForeignKeyConstraint(["run_id"], ["research_runs.id"], ondelete="RESTRICT", name="fk_research_run_manifests_run"),
        sa.PrimaryKeyConstraint("run_id", name="pk_research_run_manifests"),
    )
    _backfill_existing_terminal_runs()

    op.execute(
        """
        CREATE TRIGGER trg_research_runs_start_queued
        BEFORE INSERT ON research_runs
        WHEN NEW.state <> 'queued'
        BEGIN
            SELECT RAISE(ABORT, 'research runs must start queued');
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_research_runs_state_transition
        BEFORE UPDATE OF state ON research_runs
        WHEN NEW.state <> OLD.state AND NOT (
            (OLD.state = 'queued' AND NEW.state IN ('collecting', 'failed', 'cancelled')) OR
            (OLD.state = 'collecting' AND NEW.state IN ('validating', 'partial', 'failed', 'cancelled')) OR
            (OLD.state = 'validating' AND NEW.state IN ('synthesizing', 'partial', 'failed', 'cancelled')) OR
            (OLD.state = 'synthesizing' AND NEW.state IN ('completed', 'completed_with_gaps', 'partial', 'failed', 'cancelled'))
        )
        BEGIN
            SELECT RAISE(ABORT, 'invalid research run state transition');
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_research_runs_immutable_after_manifest
        BEFORE UPDATE ON research_runs
        WHEN EXISTS (SELECT 1 FROM research_run_manifests WHERE run_id = OLD.id)
        BEGIN
            SELECT RAISE(ABORT, 'finalized research run is immutable');
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_research_run_manifests_terminal_only
        BEFORE INSERT ON research_run_manifests
        WHEN NOT EXISTS (
            SELECT 1 FROM research_runs
            WHERE id = NEW.run_id
              AND state IN ('completed', 'completed_with_gaps', 'partial', 'failed', 'cancelled')
        )
        BEGIN
            SELECT RAISE(ABORT, 'run manifest requires a terminal research run');
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_research_run_manifests_no_update
        BEFORE UPDATE ON research_run_manifests
        BEGIN
            SELECT RAISE(ABORT, 'research run manifest is immutable');
        END;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_research_run_manifests_no_delete
        BEFORE DELETE ON research_run_manifests
        BEGIN
            SELECT RAISE(ABORT, 'research run manifest is immutable');
        END;
        """
    )
    for table in ("source_records", "evidence"):
        for operation in ("INSERT", "UPDATE", "DELETE"):
            if operation == "INSERT":
                condition = "EXISTS (SELECT 1 FROM research_run_manifests WHERE run_id = NEW.run_id)"
            elif operation == "UPDATE":
                condition = (
                    "EXISTS (SELECT 1 FROM research_run_manifests WHERE run_id = OLD.run_id) OR "
                    "EXISTS (SELECT 1 FROM research_run_manifests WHERE run_id = NEW.run_id)"
                )
            else:
                condition = "EXISTS (SELECT 1 FROM research_run_manifests WHERE run_id = OLD.run_id)"
            op.execute(
                f"""
                CREATE TRIGGER trg_{table.lower()}_immutable_after_manifest_{operation.lower()}
                BEFORE {operation} ON {table}
                WHEN {condition}
                BEGIN
                    SELECT RAISE(ABORT, 'finalized research run evidence is immutable');
                END;
                """
            )


def _decode_json(value):
    if value is None:
        return {}
    return json.loads(value) if isinstance(value, str) else value


def _backfill_existing_terminal_runs() -> None:
    """Freeze already-terminal V2-003 runs at upgrade time before installing write guards."""
    connection = op.get_bind()
    terminal_states = ("completed", "completed_with_gaps", "partial", "failed", "cancelled")
    runs = connection.execute(
        sa.text(
            "SELECT id, project_id, plan_id, plan_version, state, started_at, finished_at, coverage_summary, created_at "
            "FROM research_runs WHERE state IN (:completed, :completed_with_gaps, :partial, :failed, :cancelled)"
        ),
        dict(zip(("completed", "completed_with_gaps", "partial", "failed", "cancelled"), terminal_states)),
    ).mappings()
    for run in runs:
        plan = connection.execute(
            sa.text(
                "SELECT id, project_id, version, question, geos, platforms, period_start, period_end, "
                "comparison_period_start, comparison_period_end, goals, keywords, source_policy, created_at "
                "FROM research_plans WHERE id=:plan_id"
            ),
            {"plan_id": run["plan_id"]},
        ).mappings().one()
        source_records = connection.execute(
            sa.text(
                "SELECT id, run_id, source_registry_id, source_name, source_type, collection_mode, source_url, "
                "title, retrieved_at, published_at, content_sha256, scope "
                "FROM source_records WHERE run_id=:run_id ORDER BY id"
            ),
            {"run_id": run["id"]},
        ).mappings().all()
        evidence_rows = connection.execute(
            sa.text(
                "SELECT id, run_id, source_record_id, excerpt_or_ref, method, quality, status, scope, observed_at, created_at "
                "FROM evidence WHERE run_id=:run_id ORDER BY id"
            ),
            {"run_id": run["id"]},
        ).mappings().all()
        content = {
            "schema_version": 1,
            "run": {
                **{key: run[key] for key in ("id", "project_id", "plan_id", "plan_version", "state", "started_at", "finished_at", "created_at")},
                "coverage_summary": _decode_json(run["coverage_summary"]),
            },
            "plan": {
                **{key: plan[key] for key in ("id", "project_id", "version", "question", "period_start", "period_end", "comparison_period_start", "comparison_period_end", "created_at")},
                "geos": _decode_json(plan["geos"]),
                "platforms": _decode_json(plan["platforms"]),
                "goals": _decode_json(plan["goals"]),
                "keywords": _decode_json(plan["keywords"]),
                "source_policy": _decode_json(plan["source_policy"]),
            },
            "source_records": [
                {**dict(row), "scope": _decode_json(row["scope"])} for row in source_records
            ],
            "evidence": [{**dict(row), "scope": _decode_json(row["scope"])} for row in evidence_rows],
        }
        canonical = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        connection.execute(
            sa.text(
                "INSERT INTO research_run_manifests (run_id, version, content, checksum_sha256, created_at) "
                "VALUES (:run_id, 1, :content, :checksum, :created_at)"
            ),
            {
                "run_id": run["id"],
                "content": json.dumps(content, ensure_ascii=False),
                "checksum": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )


def downgrade() -> None:
    for table in ("source_records", "evidence"):
        for operation in ("INSERT", "UPDATE", "DELETE"):
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table.lower()}_immutable_after_manifest_{operation.lower()}")
    op.execute("DROP TRIGGER IF EXISTS trg_research_run_manifests_no_delete")
    op.execute("DROP TRIGGER IF EXISTS trg_research_run_manifests_no_update")
    op.execute("DROP TRIGGER IF EXISTS trg_research_run_manifests_terminal_only")
    op.execute("DROP TRIGGER IF EXISTS trg_research_runs_immutable_after_manifest")
    op.execute("DROP TRIGGER IF EXISTS trg_research_runs_state_transition")
    op.execute("DROP TRIGGER IF EXISTS trg_research_runs_start_queued")
    op.drop_table("research_run_manifests")

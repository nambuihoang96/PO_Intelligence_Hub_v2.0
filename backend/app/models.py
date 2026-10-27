from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class ResearchProject(Base):
    __tablename__ = "research_projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner: Mapped[str | None] = mapped_column(String(200))
    category: Mapped[str | None] = mapped_column(String(120))
    workspace_state_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ResearchSubject(Base):
    """Project-owned reusable identity; source names are never merged implicitly."""

    __tablename__ = "research_subjects"
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_research_subjects_project_id"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                             name="fk_research_subjects_project"),
        Index("ix_research_subjects_project_name", "project_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    subject_type: Mapped[str | None] = mapped_column(String(120))
    aliases_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    external_ids_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    provenance_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ResearchSubjectReference(Base):
    """An explicit association between a source-local identity and a project subject."""

    __tablename__ = "research_subject_references"
    __table_args__ = (
        UniqueConstraint("project_id", "source_kind", "source_id", "source_key",
                         name="uq_research_subject_refs_source_identity"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                             name="fk_research_subject_refs_project"),
        ForeignKeyConstraint(["project_id", "subject_id"], ["research_subjects.project_id", "research_subjects.id"],
                             ondelete="RESTRICT", name="fk_research_subject_refs_subject"),
        CheckConstraint("source_kind IN ('report_entity','csv_entity')", name="ck_research_subject_refs_source_kind"),
        Index("ix_research_subject_refs_subject", "project_id", "subject_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(24), nullable=False)
    source_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source_key: Mapped[str] = mapped_column(String(500), nullable=False)
    source_name: Mapped[str] = mapped_column(String(500), nullable=False)
    provenance_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ResearchBenchmarkCollection(Base):
    """Project-owned, reusable grouping of explicitly selected research subjects."""

    __tablename__ = "research_benchmark_collections"
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_research_benchmark_collections_project_id"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                             name="fk_research_benchmark_collections_project"),
        Index("ix_research_benchmark_collections_project_name", "project_id", "name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


class ResearchBenchmarkCollectionMember(Base):
    """Explicit subject membership; underlying report/CSV inputs stay canonical."""

    __tablename__ = "research_benchmark_collection_members"
    __table_args__ = (
        UniqueConstraint("collection_id", "subject_id", name="uq_research_benchmark_collection_member"),
        ForeignKeyConstraint(["project_id", "collection_id"],
                             ["research_benchmark_collections.project_id", "research_benchmark_collections.id"],
                             ondelete="RESTRICT", name="fk_research_benchmark_collection_member_collection"),
        ForeignKeyConstraint(["project_id", "subject_id"],
                             ["research_subjects.project_id", "research_subjects.id"],
                             ondelete="RESTRICT", name="fk_research_benchmark_collection_member_subject"),
        Index("ix_research_benchmark_collection_members_project", "project_id", "collection_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    collection_id: Mapped[str] = mapped_column(String(36), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ProjectTrendUpdate(Base):
    """Append-only owner-captured trend claim with explicit project provenance."""

    __tablename__ = "project_trend_updates"
    __table_args__ = (
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                             name="fk_project_trend_updates_project"),
        ForeignKeyConstraint(["project_id", "subject_id"], ["research_subjects.project_id", "research_subjects.id"],
                             ondelete="RESTRICT", name="fk_project_trend_updates_subject"),
        ForeignKeyConstraint(["project_id", "collection_id"], ["research_benchmark_collections.project_id", "research_benchmark_collections.id"],
                             ondelete="RESTRICT", name="fk_project_trend_updates_collection"),
        CheckConstraint("source_status = 'source_reported_unverified'", name="ck_project_trend_updates_unverified"),
        Index("ix_project_trend_updates_project_published", "project_id", "published_on", "created_at"),
        Index("ix_project_trend_updates_collection_subject", "project_id", "collection_id", "subject_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(36), nullable=False)
    collection_id: Mapped[str | None] = mapped_column(String(36))
    exact_claim: Mapped[str] = mapped_column(Text, nullable=False)
    source_note: Mapped[str] = mapped_column(Text, nullable=False)
    source_title: Mapped[str | None] = mapped_column(String(500))
    source_url: Mapped[str | None] = mapped_column(String(2048))
    published_on: Mapped[date] = mapped_column(Date, nullable=False)
    source_status: Mapped[str] = mapped_column(String(40), nullable=False, default="source_reported_unverified",
                                               server_default="source_reported_unverified")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class POOpportunityDecision(Base):
    """PO-owned candidate decisions with optimistic concurrency, separate from imported research."""

    __tablename__ = "po_opportunity_decisions"
    __table_args__ = (
        UniqueConstraint("project_id", "candidate_id", name="uq_po_opportunity_decisions_project_candidate"),
        CheckConstraint("revision >= 1", name="ck_po_opportunity_decisions_revision_positive"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT",
                             name="fk_po_opportunity_decisions_project"),
        Index("ix_po_opportunity_decisions_project_updated", "project_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    candidate_id: Mapped[str] = mapped_column(String(100), nullable=False)
    decision_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ResearchPlan(Base):
    __tablename__ = "research_plans"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_research_plans_project_version"),
        UniqueConstraint("project_id", "id", "version", name="uq_research_plans_project_id_version"),
        CheckConstraint("version >= 1", name="ck_research_plans_version_positive"),
        CheckConstraint(
            "(period_start IS NULL AND period_end IS NULL) OR "
            "(period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end)",
            name="ck_research_plans_period_valid",
        ),
        CheckConstraint(
            "(comparison_period_start IS NULL AND comparison_period_end IS NULL) OR "
            "(comparison_period_start IS NOT NULL AND comparison_period_end IS NOT NULL AND "
            "comparison_period_start <= comparison_period_end)",
            name="ck_research_plans_comparison_period_valid",
        ),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT", name="fk_research_plans_project"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    geos: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    platforms: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    comparison_period_start: Mapped[date | None] = mapped_column(Date)
    comparison_period_end: Mapped[date | None] = mapped_column(Date)
    goals: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_policy: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ResearchRun(Base):
    __tablename__ = "research_runs"
    __table_args__ = (
        CheckConstraint(
            "state IN ('queued','collecting','validating','synthesizing','completed','completed_with_gaps','partial','failed','cancelled')",
            name="ck_research_runs_state",
        ),
        ForeignKeyConstraint(
            ["project_id", "plan_id", "plan_version"],
            ["research_plans.project_id", "research_plans.id", "research_plans.version"],
            ondelete="RESTRICT",
            name="fk_research_runs_plan_version",
        ),
        Index("ix_research_runs_project_created", "project_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plan_id: Mapped[str] = mapped_column(String(36), nullable=False)
    plan_version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", server_default=text("'queued'"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    coverage_summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ResearchRunManifest(Base):
    __tablename__ = "research_run_manifests"
    __table_args__ = (
        CheckConstraint("version >= 1", name="ck_research_run_manifests_version_positive"),
        CheckConstraint("length(checksum_sha256) = 64", name="ck_research_run_manifests_checksum_length"),
        ForeignKeyConstraint(["run_id"], ["research_runs.id"], ondelete="RESTRICT", name="fk_research_run_manifests_run"),
    )

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class AppStoreListing(Base):
    __tablename__ = "app_store_listings"
    __table_args__ = (
        UniqueConstraint("platform", "country", "store_app_id", name="uq_app_store_listings_platform_country_store_id"),
        CheckConstraint("platform IN ('ios','android')", name="ck_app_store_listings_platform"),
        CheckConstraint("length(country) = 2 AND country GLOB '[A-Z][A-Z]'", name="ck_app_store_listings_country"),
        Index("ix_app_store_listings_country_platform_id", "country", "platform", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    store_app_id: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    developer: Mapped[str] = mapped_column(String(200), nullable=False)
    listing_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ImportedResearchReport(Base):
    """A verbatim report explicitly imported by the local user."""

    __tablename__ = "imported_research_reports"
    __table_args__ = (
        UniqueConstraint("content_sha256", name="uq_imported_research_reports_content_sha256"),
        CheckConstraint("origin = 'chatgpt_user_import'", name="ck_imported_research_reports_origin"),
        Index("ix_imported_research_reports_imported_id", "imported_at", "id"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"]),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str | None] = mapped_column(String(36))
    question: Mapped[str] = mapped_column(Text, nullable=False)
    geo: Mapped[str] = mapped_column(String(100), nullable=False)
    os: Mapped[str] = mapped_column(String(100), nullable=False)
    research_period: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    research_data_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    parse_status: Mapped[str] = mapped_column(String(32), nullable=False, default="NEEDS_STRUCTURING")
    extraction_error: Mapped[str | None] = mapped_column(Text)
    benchmark_selections_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    benchmark_workspace_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    origin: Mapped[str] = mapped_column(String(40), nullable=False, default="chatgpt_user_import", server_default=text("'chatgpt_user_import'"))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class QuantitativeDataset(Base):
    """Preserved CSV dataset optionally owned by a workspace and/or report."""

    __tablename__ = "quantitative_datasets"
    __table_args__ = (
        UniqueConstraint("report_id", "content_sha256", name="uq_quant_datasets_report_hash"),
        UniqueConstraint("project_id", "content_sha256", name="uq_quant_datasets_project_hash"),
        CheckConstraint("report_id IS NOT NULL OR project_id IS NOT NULL", name="ck_quant_datasets_has_owner"),
        CheckConstraint("compatibility_status IN ('compatible','partial','incompatible')", name="ck_quant_datasets_compatibility"),
        Index("ix_quant_datasets_report_created", "report_id", "created_at"),
        Index("ix_quant_datasets_project_created", "project_id", "created_at"),
        ForeignKeyConstraint(["project_id"], ["research_projects.id"], ondelete="RESTRICT", name="fk_quant_datasets_project"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("imported_research_reports.id", ondelete="RESTRICT"))
    project_id: Mapped[str | None] = mapped_column(String(36))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    original_csv: Mapped[str] = mapped_column(Text, nullable=False)
    field_mapping_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    entity_mappings_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    observations_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    compatibility_status: Mapped[str] = mapped_column(String(24), nullable=False, default="partial")
    validation_reasons_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class SourceRegistry(Base):
    __tablename__ = "source_registry"
    __table_args__ = (
        CheckConstraint(
            "license_status IN ('unknown','manual_only','approved','blocked','review_required')",
            name="ck_source_registry_license_status",
        ),
        CheckConstraint("collection_mode IN ('manual','approved_adapter','import')", name="ck_source_registry_collection_mode"),
        CheckConstraint(
            "enabled = 0 OR (license_status = 'approved' AND collection_mode = 'approved_adapter')",
            name="ck_source_registry_enabled_requires_approval",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    url_domain: Mapped[str | None] = mapped_column(String(253))
    license_status: Mapped[str] = mapped_column(String(24), nullable=False, default="unknown", server_default=text("'unknown'"))
    collection_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", server_default=text("'manual'"))
    rate_limit: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(default=False, server_default=text("0"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class SourceRecord(Base):
    __tablename__ = "source_records"
    __table_args__ = (
        UniqueConstraint("run_id", "id", name="uq_source_records_run_id"),
        CheckConstraint("collection_mode IN ('manual','approved_adapter','import')", name="ck_source_records_collection_mode"),
        ForeignKeyConstraint(["run_id"], ["research_runs.id"], ondelete="RESTRICT", name="fk_source_records_run"),
        Index("ix_source_records_run_retrieved", "run_id", "retrieved_at"),
        Index("ix_source_records_registry", "source_registry_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source_registry_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("source_registry.id", ondelete="RESTRICT")
    )
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    collection_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", server_default=text("'manual'"))
    source_url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    scope: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint("quality IN ('observed','measured','estimated','inferred','insufficient')", name="ck_evidence_quality"),
        CheckConstraint("status IN ('verified','needs_review','unsupported','rejected')", name="ck_evidence_status"),
        ForeignKeyConstraint(
            ["run_id", "source_record_id"],
            ["source_records.run_id", "source_records.id"],
            ondelete="RESTRICT",
            name="fk_evidence_source_same_run",
        ),
        Index("ix_evidence_run_created", "run_id", "created_at"),
        Index("ix_evidence_source_record", "source_record_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(String(36), nullable=False)
    source_record_id: Mapped[str] = mapped_column(String(36), nullable=False)
    excerpt_or_ref: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(String(80), nullable=False)
    quality: Mapped[str] = mapped_column(String(24), nullable=False, default="insufficient", server_default=text("'insufficient'"))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="needs_review", server_default=text("'needs_review'"))
    scope: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

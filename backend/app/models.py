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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)


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

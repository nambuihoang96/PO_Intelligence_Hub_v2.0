# Data Analysis Preparation — Current Capability Audit

Date: 2026-10-29
Branch: `feat/ux-recovery-01-research-results`
Scope: read-only code audit; no Data Analysis feature implementation.

## Existing and exercised

- Report-owned and project-owned quantitative CSV preview/import, dataset listing/read, revalidation, metadata review, and hash lookup are exposed through `frontend/src/reports/api.ts` and implemented by `backend/app/quantitative.py` and report/project routes.
- Comparison dataset listing and compatibility preview are exposed through `backend/app/quantitative_comparisons.py` and mounted by `backend/app/main.py`.
- Frontend building blocks exist in `QuantitativeDatasetExplorer.tsx`, `QuantitativeEvidence.tsx`, `QuantitativeComparisonCharts.tsx`, `QuantitativePeriodComparison.tsx`, `DataFirstWorkspace.tsx`, `quantitativeState.ts`, `quantitativePresentation.ts`, and `quantitativeAnalytics.ts`.
- Backend regression coverage exists in `tests/test_quantitative.py` and `tests/test_quantitative_comparisons.py`; frontend tests sit beside the quantitative components and state/analytics helpers.
- Schema evolution is additive through Alembic history. Quantitative foundation starts at `20261020_0007_quantitative_foundation.py`; workspace-owned datasets are added at `20261023_0008_workspace_owned_quant_datasets.py`; the current migration sequence continues through `20261027_0015_project_saved_information.py`. This task made no migration.
- Existing capability is suitable for local research CSV workflows, with report/project scoping, raw/provenance-aware observations, readiness/validation feedback, and compatible-period preview logic. It does not mean every uploaded dataset is comparable or analytics-ready.

## Implemented but still requiring product/workflow validation

- Generic local CSV intake is available, including column mapping and validation. Sensor Tower exports have dedicated handling from previous work, but report/project context, missing metadata, entity ambiguity and comparison compatibility still need product-level acceptance with representative real exports.
- Dataset explorer and quantitative evidence/chart components exist, but this handoff does not claim that every source, metric methodology, period combination or mobile interaction is accepted.
- Derived comparison preview is guarded by compatibility checks. Missing GEO/platform/period or methodology must remain missing/incompatible; it must not be filled from a filename or neighboring row.

## Not built as provider integrations in the audited code

- No automatic AppMagic/Sensor Tower account connector or paid provider API was confirmed by this audit. Sensor Tower local CSV support is file import, not provider synchronization.
- No Firebase/GA4 Product Health ingestion/metric builder was found.
- No AdMob ingestion or ad monetization connector was found.
- No new UA/custom-metric modeling workflow or dedicated data-analysis decision tracker was added here. Existing project decisions/Tracking are separate product workflow capabilities, not an analytics source integration.
- No new dashboard, chart, importer, aggregation, or provider connection was implemented for this task.

## Suggested next sequence

1. Complete G3-06's already-approved exact desktop/mobile browser verification and persistence regression.
2. Review remaining G3 tasks and their dependencies in `docs/RECOVERY_BOARD.md`; validate existing CSV → dataset → compatibility → evidence paths with isolated real files before adding scope.
3. Only then define any missing source-specific ingestion requirements. Keep market datasets, product telemetry, ad monetization and UA data as distinct provenance/methodology domains; do not compare them by matching labels alone.

This is an inventory of code observed in this repository, not a product acceptance decision.

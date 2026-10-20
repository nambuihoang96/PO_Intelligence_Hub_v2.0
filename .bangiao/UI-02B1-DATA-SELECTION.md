# UI-02B.1 — Analytics Data Selection & Readiness

**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `59c1e9064135b536b33990aac0755478a572407b`
**Status:** Implemented; awaiting PO review. Responsive screenshot artifacts are not complete.

## Delivery

This adds a report-scoped analytics selection layer to Research Overview using the existing `po_research_v1`, quantitative observation, and linked CSV dataset contracts. It does not add backend routes, models, migrations, charts, or derived metrics.

The typed selection contract derives metric, GEO, platform, period, entity, source, and readiness choices from the report's supplied observations and linked datasets. It keeps incomplete and incompatible rows visible with reasons, labels report-supplied and CSV values as unverified unless their stored verification state says otherwise, and flags exact duplicate rows without deleting them.

Comparison groups require matching metric identity and definition, unit, methodology, GEO, platform, and granularity. Entity comparisons require the exact same period window; temporal groups remain within one entity and keep the supplied periods intact. No missing periods or values are filled and no change metric is calculated. Every eligible observation remains represented in the selection contract, and chart limitations are exposed for the next phase.

Research Overview loads all pages of datasets linked to the current report. The selection UI provides evidence navigation to report observations and CSV records. During browser UAT, a CSV evidence target mismatch was found and corrected. Entity filter labels now preserve the report-supplied display name when a linked CSV row only contains an ID.

## Changed files

- `frontend/src/reports/analyticsSelection.ts` — reusable filters, readiness assessment, duplicate handling, compatible groups, provenance, and chart eligibility contract.
- `frontend/src/reports/analyticsSelection.test.ts` — contract coverage across reported/CSV/mixed data, entities, periods, incompatible dimensions, duplicates, incomplete values, filters, and empty state.
- `frontend/src/reports/AnalyticsDataSelection.tsx` — report-scoped filter, readiness, provenance, record preview, evidence action, and empty state.
- `frontend/src/reports/AnalyticsDataSelection.test.tsx` — UI filter/reset, provenance separation, evidence callback, excluded rows, and zero-data behavior.
- `frontend/src/reports/ReportResults.tsx` — selector integration, complete dataset pagination, and navigation to the corresponding evidence record.
- `frontend/src/style.css` — selector layout and responsive styling.

No backend contract, API, or migration changes were needed. Existing `po_research_v1` reports remain backward-compatible.

## Verification

- Frontend tests: **85 passed** across 9 files.
- Targeted selector tests after final edits: **20 passed** across 2 files.
- TypeScript check: **passed**.
- Production build: **passed** (Vite production bundle).
- Backend tests: **91 passed**; one existing Starlette/AnyIO deprecation warning.
- Migration: existing Alembic head applied successfully to the isolated UAT SQLite database.

## Browser UAT

Used the running frontend and backend on temporary localhost ports with a separate SQLite directory under `.test-tmp/ui02b1-db`; production `data/` was not used. The report fixture was explicitly synthetic and not market research.

Verified in the actual browser:

1. Opened the report with six report-supplied observations and one report-scoped CSV containing three observations.
2. Confirmed dynamic metric, GEO, platform, period, entity, source, and readiness options, including readable entity names.
3. Filtered to Linked CSV and observed three matching rows and their CSV provenance.
4. Opened a CSV observation's evidence action; the Evidence tab focused the matching saved observation after the target mismatch fix.
5. Refreshed the report and confirmed all nine observations and the linked dataset were still present.

The browser integration provided screenshot previews during this session, but its capture interface did not expose a file path or workspace export. Therefore **no screenshot PNGs could be saved under `.bangiao/screenshots/ui-02b1/` in this run**. The available in-app browser viewport was approximately 1264 × 712; 1440 × 900, 768px, and 390px viewport checks are **NOT VERIFIED**. No responsive screenshot or full screenshot artifact is claimed.

## Known limitations

- This phase prepares selection and readiness only. It does not render analytics charts or calculate derived metrics.
- Browser validation used an explicitly synthetic isolated report because the app's existing imported reports live in the protected production database; no production database was read or changed.
- Screenshot files and requested responsive viewport checks remain outstanding because the available in-app browser did not provide viewport resizing or a workspace screenshot export.

## Commit

Implementation commit: `3b751a1` (`feat(analytics): add report-scoped data selection`).

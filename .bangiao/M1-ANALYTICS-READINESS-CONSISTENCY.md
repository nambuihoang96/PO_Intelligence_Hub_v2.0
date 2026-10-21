# PO HUB — M1: Analytics Readiness & Entity Consistency

**Branch:** `feat/ux-recovery-01-research-results`
**Base HEAD:** `a816baf6b992e5c378d5a8d11018ac4dfc8c36b9`
**Status:** Technical changes complete; Product Acceptance is **NEEDS VERIFICATION** pending browser UAT.

## Root causes

- Analytics entity filters and grouping used `entity_id` only. Source-only CSV observations have no report `entity_id`, so valid apps disappeared from Analytics despite being available in Data Explorer.
- Duplicate signatures also used the report entity key. This could conflate identity decisions and did not consistently apply the namespaced CSV provider identity.
- The frontend treated completion, report scope compatibility, dataset comparison candidacy, and actual peer-group eligibility as one comparison-ready state. The Excluded filter built groups from rows it was supposed to exclude.
- Backend dataset-level comparison counts used report-level `comparison_ready`, which blocked otherwise valid Worldwide/Unified CSV measurements from analysis in their own scope.
- Legacy stored diagnostics could still say granularity was missing even when exact period start/end were present.

## Updated business rules

- **CSV entity selection:** use the stable provider-namespaced `source_entity_id` as the selectable identity. The report entity ID remains available separately when an explicit match exists.
- **Comparison identity:** use a report identity for a CSV observation only when it is explicitly marked as matched to a report entity. Different provider IDs remain separate unless that explicit mapping exists.
- **Duplicates:** compare measurements using their source identity, metric identity/definition, value, unit, GEO, platform, explicit date window, granularity, and methodology. Different source IDs are never deduplicated just because their names or values match.
- **Date windows:** exact period bounds are sufficient for source validity without inventing granularity. Temporal groups require non-overlapping explicit windows. No adjacency, PoP, or YoY is inferred here.
- **Dataset vs report:** report-scope mismatch blocks report compatibility but does not invalidate the CSV dataset's own observations or peer comparisons in the original scope.
- **Excluded filter:** it lists invalid, duplicate, report-incompatible report observations, and valid standalone measurements without a compatible comparison partner. It never creates comparison groups from the excluded selection.

## Readiness definitions

- **Display-ready:** enough information to show an individual sourced measurement.
- **Source-valid / dataset analysis-ready:** its value, metric, unit, entity identity, GEO, platform, and explicit period window are sufficiently defined and valid.
- **Dataset comparison candidate:** source-valid and includes the supplied methodology needed to compare it. This is an observation-level candidate, not a chart-ready group.
- **Report-compatible:** matches the linked report's GEO/platform/period scope. This is kept independent of source validity.
- **Eligible individual measurement:** belongs to an actual compatible comparison group in the current filter context.
- **Chart-eligible group:** at least two compatible entities in the same explicit date window, or repeated non-overlapping explicit windows for one entity, with matching metric definition, unit, GEO, platform, and methodology.

## API, schema, and migration

- Added the additive API response field `dataset_comparison_ready_observations` for dataset-level comparison candidates in preview and saved dataset responses.
- No database schema change or migration was required. Existing `po_research_v1`, source IDs, CSV rows, dataset IDs, report links, provenance, and saved report data remain intact.
- Dataset candidate counts are separate from report-compatible observation counts; actual comparison groups are formed in Analytics from peers.

## Files changed

- `backend/app/quantitative.py`
- `backend/app/reports.py`
- `backend/app/schemas.py`
- `frontend/src/reports/analyticsSelection.ts`
- `frontend/src/reports/analyticsSelection.test.ts`
- `frontend/src/reports/AnalyticsDataSelection.tsx`
- `frontend/src/reports/AnalyticsDataSelection.test.tsx`
- `frontend/src/reports/api.ts`
- `frontend/src/reports/quantitativeState.ts`
- `frontend/src/reports/quantitativeState.test.ts`
- `frontend/src/reports/QuantitativeDatasetExplorer.tsx`
- `frontend/src/reports/QuantitativeDatasetExplorer.test.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/style.css`
- `tests/test_quantitative.py`

## Automated test results

- Backend quantitative suite: **43 passed**. Includes isolated SQLite migrations/API tests, legacy dataset recovery, the 100-app acceptance case (10 matched + 90 source-only), duplicate identity, and explicit date bounds without granularity.
- Frontend suite: **10 files, 98 tests passed**.
- TypeScript check: **passed**.
- Production build: **passed**.
- `git diff --check`: passed (no whitespace errors).

## Browser UAT and screenshots

**NOT VERIFIED.** I attempted to open the disposable local UAT endpoint in the Codex in-app browser. Browser Use rejected the action under its URL policy and denied authority to inspect localhost. Its response explicitly prohibited reaching the same result through another browser surface, CDP, or browser commands, so I stopped that path. No browser screenshots were captured or fabricated.

The local browser tab supplied by the environment pointed at a separate existing localhost app; I did not change or interact with that app.

## Existing owner CSV coverage

**NOT VERIFIED for the owner's exact files.** The two Sensor Tower exports are in the user's Downloads folder, outside the authorized workspace for this task. I did not copy or upload them. The full backend suite includes an isolated Sensor Tower-style 100-app fixture and existing 225-observation legacy dataset recovery tests; this is representative automated coverage, not a claim that the exact owner files passed this task.

## Known limitations

- Browser save/refresh/reopen, visual responsive behavior, and evidence navigation remain unverified because the Codex browser URL policy blocked local UAT access.
- Exact owner CSV post-fix import and revalidation remain unverified for the same workspace-scope reason above.
- Dataset comparison readiness is reported as candidates; whether a compatible peer group exists depends on the active Analytics filters and available observations.

## Product Acceptance

- **PO goal:** Select and inspect CSV measurements in Analytics even when their apps are absent from the research report.
- **User journey:** Open Analytics Data Selection, filter by a source app identity, inspect its observation/evidence, and review whether peers match for comparison.
- **Automated work:** Source IDs remain selectable, explicitly linked report identities are available for comparisons, duplicate checks use source identity, and readiness is split into dataset validity, report compatibility, candidates, and actual compatible groups.
- **Expected result:** 100 source identities remain identifiable in the automated acceptance case; 90 source-only rows remain usable; out-of-report scope does not erase valid dataset measurements.
- **Remaining friction:** Browser UAT and exact owner-file verification still need to be completed; users may see a valid standalone measurement without a compatible peer group.
- **Verification:** Backend 43/43, frontend 98/98, TypeScript and production build passed. Browser UAT is NOT VERIFIED.
- **Decision:** **TECHNICAL PASS / PRODUCT NEEDS VERIFICATION**. Do not treat M1 as fully accepted until browser save/refresh/reopen and responsive workflow are exercised.

## Commit

- **Implementation commit SHA:** `e1be14a64408622d4aa38fa7f08bf9ca83523edb`.
- **Push:** implementation and handoff commits pushed to `origin/feat/ux-recovery-01-research-results`.

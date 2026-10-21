# PO HUB — M1 R1 Final Stabilization & Product Acceptance

**Branch:** `feat/ux-recovery-01-research-results`
**Reviewed base HEAD:** `d70c8ce134bab6f504a68ee1687c09dc7f869834`
**Implementation commit:** `87048ada1e1fa9a83f1c524131a310ea4c1ef9ed`
**Status:** `TECHNICAL PASS / PRODUCT PENDING UAT`

## Root-cause findings

### A — Excluded-filter behavior

The previous test and implementation were consistent: `passesReadiness(..., 'excluded')` included rows with `reportCompatible === false`, and also included valid standalone observations without a comparison peer. Therefore a valid Worldwide / Unified CSV row appeared in the Excluded filter while remaining source-valid. The actual product defect was the combined label “Excluded / needs review,” which suggested that scope mismatch meant bad data.

The UI now separates **Outside report scope**, **No compatible peer**, and **Needs review**. “Not in a report comparison” remains available for the combined non-report-comparable set. A scope-mismatched row continues to show **Valid in CSV scope · differs from report**; it is never relabeled as invalid. Dataset-scope groups are explicitly distinguished from groups compatible with the linked report.

### B — Granularity comparability

The grouping identity previously omitted granularity, allowing observations with the same dates but conflicting known cadence to share a group. Granularity is now part of the comparison identity:

- Same explicit period window + same known granularity: comparable.
- Same explicit period window + both granularities absent: comparable by exact dates only.
- Same window + one cadence absent: not grouped.
- Same window + conflicting known cadences: not grouped.
- Different windows across entities: not grouped together.
- Repeated windows for one entity: grouped only when they do not overlap and the other comparison dimensions match. No PoP/YoY or cadence is inferred.

All original period and granularity values remain available in the observation details.

### C — Large Analytics lists

Analytics previously rendered every selected observation as a full card. It now shows a searchable preview of 20 measurements at a time, reports the total matching selection, and offers progressive loading. Source, scope, validation details, and links are collapsed by default; the evidence-record action remains directly available on each visible measurement.

### D — Multiple values in a Data Explorer cell

A multi-value cell previously opened its first row automatically. It now opens a chooser listing every original measurement with value, GEO, platform, period, granularity, and methodology. Selecting one opens that exact record; no values are combined. Provider IDs are namespaced consistently so the same raw ID from different providers remains distinct.

### E — Cross-surface consistency

Analytics filtering and evidence navigation continue to pass the full observation record. Data Explorer now uses provider-namespaced source identity and exposes supplied evidence/source links, exact dimensions, validation and CSV provenance. No API or database schema changes were required.

## Before / after PO workflow

**Before:** A PO could see a valid measurement under a generic “Excluded / needs review” label; long result lists expanded into hundreds of cards; clicking a multi-value cell silently opened the first row.

**After:** The PO can distinguish scope mismatch, missing comparison peers and data needing review; search and page through a compact results preview; expand source details when needed; and choose the exact original observation from an ambiguous cell before opening evidence.

## Files changed

- `frontend/src/reports/analyticsSelection.ts`
- `frontend/src/reports/analyticsSelection.test.ts`
- `frontend/src/reports/AnalyticsDataSelection.tsx`
- `frontend/src/reports/AnalyticsDataSelection.test.tsx`
- `frontend/src/reports/QuantitativeDatasetExplorer.tsx`
- `frontend/src/reports/QuantitativeDatasetExplorer.test.tsx`
- `frontend/src/style.css`
- `tests/test_quantitative.py`

No migration or production database change was made.

## Automated verification

- `cd frontend; npm test` — **10 files, 107 tests passed**.
- `cd frontend; npm run typecheck` — **passed**.
- `cd frontend; npm run build` — **passed** (Vite production build).
- `.\.venv\Scripts\python.exe -m unittest tests.test_quantitative tests.test_reports` — **75 tests passed**. Tests use per-test temporary SQLite databases.
- `git diff --check` — **passed**.

Added/covered cases include 100 apps with 90 source-only identities, identical values across different source IDs, true repeated source measurements, scope mismatch, standalone valid data, excluded/needs-review filters, granularity combinations, evidence navigation, 225-item preview paging, provider ID collisions, multi-observation cell selection, and a 225-observation Sensor Tower-style import/refresh/revalidation round trip with raw CSV and report linkage preserved.

The 225-row dataset is a generated representative fixture. It is **not** the owner’s exact CSV.

## Browser UAT and exact owner CSV

**Browser UAT: NOT VERIFIED.** Local browser access was rejected by the browser policy in the prior attempt. This task explicitly forbids trying alternate browser surfaces or bypasses, so I did not retry through another method and captured no screenshots.

**Exact owner CSV files: NOT VERIFIED in this task.** A workspace file scan found no matching exports. I used only isolated representative fixtures and did not read or copy the files from Downloads.

### Owner-run UAT checklist

Run against a disposable local data directory, not the production SQLite file:

1. Open an existing research report and import a Sensor Tower export. Confirm the intended GEO, `Unified` platform, and exact period bounds in preview.
2. Confirm import, refresh the report, and verify the dataset remains linked to that report with the same observation count and original CSV.
3. In Data Explorer, search for a source-only game. Confirm its provider ID and name remain stable.
4. For a cell with multiple measurements, choose each listed record in turn. Check value, metric, GEO, platform, period, granularity, methodology, and supplied evidence/source; confirm no aggregation occurs.
5. In Analytics Selection, check **Outside report scope**, **No compatible peer**, **Needs review**, and **Measurements in compatible groups** separately. A valid Worldwide / Unified row linked to a US / Android report must stay valid in its own CSV scope and must not be converted into Android data.
6. Use search and the entity/metric filters. Confirm only a compact initial result set renders and that source/evidence navigation follows the selected row.
7. Refresh and reopen the report, then revalidate the dataset. Confirm dataset ID, report link, raw CSV, source identities, observations, and notes remain intact.
8. Repeat at desktop and mobile widths; verify no clipped measurement chooser or horizontal page overflow.

Expected result: out-of-scope data is clearly marked as valid in its original scope; missing peers are not called corrupt; incomplete or duplicate rows remain traceable; evidence opens for the chosen measurement; refresh/revalidation preserves the saved dataset.

## Remaining risks and acceptance

- **Technical acceptance: PASS.** Regression, identity, readiness, granularity, large-list, chooser, persistence-fixture, TypeScript, build, and diff checks passed.
- **Product acceptance: PENDING UAT.** The end-to-end browser journey, responsive behavior, and exact owner CSV behavior still require the owner-run checklist above.
- No M2/M3 features, CSV analytics, migrations, or master merge were started.

## Commit

`87048ada1e1fa9a83f1c524131a310ea4c1ef9ed`

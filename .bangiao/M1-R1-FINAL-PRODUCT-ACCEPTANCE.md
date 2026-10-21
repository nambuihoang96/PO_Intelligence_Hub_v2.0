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

The earlier 225-row dataset was a generated representative fixture and was **not** the owner’s exact CSV.

## Browser UAT and exact owner CSV

**Browser UAT: NOT VERIFIED.** Local browser access was rejected by the browser policy in the prior attempt. This task explicitly forbids trying alternate browser surfaces or bypasses, so I did not retry through another method and captured no screenshots.

### Exact owner CSV supplied on 2026-10-21

Read-only source: `C:\Users\Admin\Downloads\Unified Top Apps Downloads YoY Growth test.csv` (5,794 bytes). The original file was not modified.

**Route-level isolated SQLite check: PASS.** The exact file was run through preview, import, persistence, duplicate detection, list/refresh, and revalidation logic using a temporary database that was discarded. The harness explicitly left the source entities unmapped because no actual report was supplied for this isolated check; it did not create product matches or research claims.

Observed source shape:

- Semicolon-delimited; 25 rows and 25 unique `Unified ID` values.
- All rows say `Platform = Unified`; that value was preserved and never converted to iOS or Android.
- Nine wide metric columns produced 225 observations.
- The CSV text passed to the importer was preserved; duplicate import returned the existing dataset and kept the linked dataset count at one; revalidation retained the same content hash and all 225 observations.
- All observations remained `unverified`.

The file is readable, but it is not ready for analytics as supplied:

- It has no GEO field. Its `Date` column contains only `14/10/2026`; this was not fabricated into start/end period bounds.
- Sixteen populated values in the three `YoY Growth %` columns are not strict numeric values (examples include `15.048.858`). They were retained as invalid observations rather than repaired by guessing a locale. Other blank percent cells remained missing.
- Revenue columns do not declare a unit/currency. No unit was inferred.
- Therefore, with the source exactly as supplied and no extra scope confirmation, **0/225 observations were complete, 0 were analytics-ready, and 0 were comparison-ready**. This is a valid partial import state, not a clean analytics dataset.

Metric value validation from the actual file:

| Metric column | Exact numeric values | Non-numeric values | Blank values |
| --- | ---: | ---: | ---: |
| Downloads (Absolute) | 25 | 0 | 0 |
| Downloads (YoY Growth) | 25 | 0 | 0 |
| Downloads (YoY Growth %) | 1 | 8 | 16 |
| Revenue (Absolute) | 25 | 0 | 0 |
| Revenue (YoY Growth) | 25 | 0 | 0 |
| Revenue (YoY Growth %) | 6 | 2 | 17 |
| DAU (Absolute) | 25 | 0 | 0 |
| DAU (YoY Growth) | 25 | 0 | 0 |
| DAU (YoY Growth %) | 3 | 6 | 16 |

Imported-content SHA-256: `dfed2e06ef40c23ef95a0558ac337d2487f42d81541510cc80ef0029c7b99b3f`.

### Newer copy found on a second read

The file at the same path was modified after the first check (its current modification time is 2026-10-21 15:49; byte size is now 6,254). The current copy has 27 rows: 25 dated `14/10/2026` and only two dated `14/11/2026`.

The November rows are `Surprise Dumpling: ASMR Box` and `Mystery Dumpling: Unbox ASMR`. Each matches its October row in every other CSV field, including all metric values; only `Date` differs. The other 23 products have no November row. `14/11/2026` is also in the future relative to this check (2026-10-21). This is not a complete or credible two-period comparison dataset without owner confirmation; the repeated values must not be treated as measured change.

The current copy still parses as 27 × 9 = 243 observations when the single `Date` column is mapped as one period bound, but it remains partial: GEO and the other period bound are absent, 18 populated percentage cells are non-numeric, and 0 observations are complete, analytics-ready, or comparison-ready. No values were inferred or corrected. Current file SHA-256 (raw bytes): `F049C844F22438E4CF63E8B97B9F5EB9059F08AD5282C885576B7D53E5901E60`.

This newer copy received a read-only structural/parser check; the previous isolated SQLite persistence round trip above used the earlier 25-row copy. Browser UAT remains NOT VERIFIED.

**Browser UAT remains NOT VERIFIED.** This check exercised the report route logic and isolated SQLite directly; it did not operate the UI. The previous browser policy restriction remains in effect, so no screenshots or UI-pass claim were added.

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
- **Product acceptance: PENDING UAT.** Backend/import checks passed for the earlier file copy; the newer 27-row copy received structural/parser checks only. End-to-end browser behavior, responsive layout, and linking to the intended research report still require UI UAT.
- No M2/M3 features, CSV analytics, migrations, or master merge were started.

## Commit

`87048ada1e1fa9a83f1c524131a310ea4c1ef9ed`

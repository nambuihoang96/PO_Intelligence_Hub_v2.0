# PO HUB — M3-B R1: Chart UX, Ranking Correctness & Product Acceptance

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Starting HEAD: `d6492f67d50b5c82268c11d6346175c3a98c81a0`
- Implementation commit: `b975152`
- Scope: frontend chart ordering, selection copy, focused regression tests, and this handoff. No backend, API, schema, database, CSV importer, or research contract changes.

## Root cause

The chart adapter sorted rows by app name by default, while the UI called the selector “Top apps” and sliced the first N rows. Alphabetical filtering could therefore look like a performance ranking. The same generic change sort was also used for baseline/current, absolute-change, and percentage-change charts, so the visible order did not explain the business criterion.

The new selection summary also used ranking language when the user explicitly chose alphabetical order. This was corrected during browser UAT to say that alphabetical selection is not a performance ranking.

## Behavior after the fix

- Baseline/current defaults to highest current value; the PO can choose highest baseline value or app name A–Z.
- Absolute change defaults to largest increase; largest decrease is available.
- Percentage change defaults to highest valid percentage; lowest valid percentage is available. Null percentages are sorted last and excluded from percentage bars.
- The selected ordering is applied before the number-of-apps limit.
- “Show apps” offers 10, 25, 50, or all eligible apps; it no longer says “Top 10”. The summary shows visible and eligible counts, selected criterion, and total rows retained in the complete table.
- Alphabetical selection is explicitly labeled as not a performance ranking. Numeric ordering is described as ranking within selected exports, not the whole market.
- Numeric values, percentages, unavailable reasons, and evidence continue to come from M2 responses; React does not calculate market metrics. Ties resolve by case-insensitive app name and then stable source key.

## M3-A report-chart scenarios reviewed

The current report renderer supports report-supplied grouped bars for multiple entities across two non-overlapping periods, a date-labeled matrix when windows overlap or do not form one compatible pair, a distinct two-point view for a single entity with two observations, and an observed time-series view for one entity with more than two dates. The time-series renderer positions points by actual dates. A multi-entity, multi-line time series is not implemented or claimed. Every displayed observation keeps its own evidence action.

## Changed files

- `frontend/src/reports/comparisonChartAdapter.ts` — chart-specific sort types, defaults, labels, deterministic ordering.
- `frontend/src/reports/comparisonChartAdapter.test.ts` — ordering, defaults, null handling, and deterministic ties.
- `frontend/src/reports/QuantitativeComparisonCharts.tsx` — sorting before selection, chart-specific options, visible/eligible counts, market-scope clarification, and alphabetical-selection copy.
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx` — regression tests for criteria changes, default ordering, app limits, search, table completeness, and alphabetical labeling.
- `frontend/src/style.css` — selection-summary presentation.
- `.bangiao/M3B-R1-CHART-UX-PRODUCT-ACCEPTANCE.md` — handoff.

## Verification

- `frontend`: `npm.cmd test -- --run --maxWorkers=1` — **133 passed, 13 test files**.
- `frontend`: `npm.cmd run build` — **passed**, including `tsc --noEmit` and Vite production build.
- Backend: `.venv\Scripts\python.exe -m pytest tests -q` — **128 passed**, 1 third-party deprecation warning.
- `git diff --check` — **passed**.

## Browser UAT

Browser UAT ran against a disposable SQLite database on isolated local ports. The fixture contained 22 synthetic app rows over two snapshot periods, with source IDs and evidence URLs. It included a high-current app near the end of the alphabet, positive and negative changes, true zero, a zero baseline, one baseline-only app, one current-only app, and a negative signed source observation. The fixtures and temporary database were removed after verification.

### Journey A — CSV comparison

- Selected the two stored exports and ran the comparison. API returned 20 comparable rows, one baseline-only, one current-only, and 22 total app rows.
- Default baseline/current order displayed `Zebra Champion` first at 1,000 → 5,000, although it sorts last alphabetically. The API supplied absolute change +4,000 and percentage +400%; those same values appeared in the full table.
- App-name A–Z placed `Apple Decline` first and showed the explicit “not a performance ranking” message.
- Largest increase placed Zebra first; largest decrease placed Maple Down first (-1,000). Highest valid percentage placed Juniper first (+1,100%); lowest placed Maple Down first (-100%). Equal values used deterministic name ordering.
- A true zero stayed `0`; zero-baseline percentage and signed-value percentage displayed unavailable with the backend reason. Missing baseline/current rows and a signed source remained in the full table. Evidence showed each original filename, source row, period, URL, report link, and `unverified` status.
- Refreshed, reselected the persisted datasets, reran the comparison, and reproduced the same result.
- Captured and visually inspected the real comparison page and the report Overview in the browser. The browser bridge displayed captures but exposed no supported path to write screenshot bytes into the repository; therefore there are no committed screenshot files.

### Journey B — ChatGPT-only report

- Created a disposable structured report with three entities and six exact, report-supplied, unverified observations across two periods; no CSV was linked.
- Overview displayed the report-derived grouped comparison. Each of the six observation buttons opened the Evidence section for its original source reference and retained unverified status.
- Refreshed the report and confirmed all six chart observations remained visible.

### Responsive verification

The available browser did not expose a viewport-resize capability. The actual in-app browser view was captured at its available approximately 1005 × 813 viewport. Requested 1440 × 900, 768px, and 390px viewport checks are **NOT VERIFIED**. Screenshot files could not be exported from the browser bridge.

## Limitations and acceptance

- No user-supplied production report or CSV was modified. Browser UAT used clearly labeled synthetic fixtures in isolated SQLite storage.
- Responsive breakpoints and saved screenshot artifacts remain unverified/unavailable in this environment.
- Multi-entity line-series charting is not implemented; the current renderer uses grouped bars or a matrix for multi-entity periods.

### Product Acceptance

- **PO goal:** Make clear which exported apps are shown, why they are shown, and how chart values tie back to measurements.
- **User journey:** Choose two exports, compare, select a meaningful sort and display count, inspect a plotted app’s evidence, switch to the complete table, and repeat after refresh.
- **Automated work:** Sorts the API-returned rows by the metric appropriate to the active chart, breaks ties deterministically, filters eligible observations, and retains excluded rows and evidence in the complete table.
- **Expected result:** The displayed subset follows the chosen business criterion; it is explicitly scoped to selected exports and cannot be mistaken for a market-wide ranking.
- **Remaining friction:** The requested 1440/768/390 viewport checks and committed screenshot artifacts remain pending; multi-entity line charts are outside this release.
- **Verification:** Full frontend/backend test suites and CSV plus ChatGPT-only browser journeys ran. Requested responsive viewport checks did not.
- **Decision:** `NEEDS FIX` for final product acceptance until responsive checks/screenshots are reviewed. Technical checks passed.

## Review status

Implementation is committed and pushed to the existing task branch. No merge or follow-up milestone was started. Awaiting Product Owner review.


# M6-B R1 — Release Closure & Owner Acceptance

## Git and scope

- Branch: `feat/ux-recovery-01-research-results`
- Starting HEAD: `ecef683b67572dfd51f6d5423f5cd8075d1522ee`
- Ending HEAD: pending commit
- No master merge, release tag, deployment, or production database access was performed.
- Preserved the pre-existing `scripts/setup.ps1` modification and unrelated untracked folders. They are not part of this task.

## Confirmed issues and corrections

- Mobile navigation relied on horizontally scrolling links, and Research destinations were hidden on other pages. Added one shared expandable navigation group for small screens. It lists all primary routes plus New research and Research runs, identifies the current page, closes after route selection, and returns keyboard focus to the toggle after Escape. Desktop keeps the existing sidebar.
- Renamed the visible route label “Period comparison” to the clearer “Compare periods.” Audited rendered entry points; the obsolete project-creation copy remains only in unused route metadata and was left untouched.
- Added regression coverage for CSV-only evidence opened from a chart bar and the full comparison table. Both preserve filenames, row numbers, and `unverified`, and do not create report links when `report_id` is absent. Existing report-linked tests now assert the chart detail retains valid report links as well as the table links.

## Historical migration and restore fixture

Created a disposable synthetic workspace at schema revision `20261023_0008`, then backed it up, migrated through the actual Alembic path to `20261024_0009`, restored the pre-migration backup to a separate disposable directory, and migrated that restored copy. API reopen checks covered project identity, imported report/original content, structured finding and unverified evidence reference, report-linked and workspace-owned CSV datasets, metadata review history, shortlist, benchmark selection, PO assessment/notes/next action, and immutable Run Manifest/evidence. SQLite integrity checks returned `ok` for the backup, migrated database, and restored database. Stable record IDs and dataset ownership were retained.

Migration `20261024_0009` introduces the opportunity-decision table; a decision cannot exist in a valid `0008` database. The test therefore creates the decision through the API after migration and again on the restored copy, then reopens it through the API. Pre-0009 historical opportunity-decision preservation is not claimed because the earlier schema has no such record/table to preserve.

## CSV-only and report-linked evidence

- Chart path: selecting a chart row opens original observations. For CSV-only sources, no “Open source report” link is rendered; filename, source row, period, and unverified status remain visible.
- Table path: CSV-only rows retain the same evidence details and no “Open report” link.
- Report-linked records retain valid links through existing chart and table rendering tests.
- Browser UAT used an isolated copy of the prior M6-B QA backup (integrity checked, one synthetic QA report, five quantitative datasets, one saved synthetic PO decision). It was copied into `.m6b-r1-qa-20261026/browser-appdata`; no production SQLite file was read or changed.

## Files changed

- `frontend/src/AppNavigation.tsx` — shared navigation and mobile toggle.
- `frontend/src/AppNavigation.test.tsx` — current route, all destinations, Escape/focus, and route-menu behavior.
- `frontend/src/main.tsx` — use shared navigation and rename the visible route label.
- `frontend/src/style.css` — responsive expandable navigation styles.
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx` — chart/table CSV-only evidence-link regression assertions and report-linked chart evidence assertion.
- `tests/test_database.py` — representative v0008 migration, backup, restore, and API reopen scenario.
- `.bangiao/M6B-R1-RELEASE-CLOSURE.md`
- `.bangiao/OWNER-RELEASE-UAT.md`

## Test results

- Backend: `python -m pytest -q` — **147 passed**, 1 Starlette/AnyIO deprecation warning.
- Frontend: `npm test -- --run --no-file-parallelism --maxWorkers=1` — **17 files, 160 tests passed**.
- Focused navigation and evidence tests: `npm test -- --run src/AppNavigation.test.tsx src/reports/QuantitativePeriodComparison.test.tsx` — **2 files, 11 tests passed**.
- TypeScript: `npm run typecheck` — passed.
- Production build: `npm run build` — passed; Vite reports the existing JS bundle-size warning (502.66 kB minified).
- Migration/restore: `tests/test_database.py::DatabaseMigrationTest::test_historical_research_migrates_restores_and_reopens_through_apis` — passed.
- `git diff --check` — passed.
- The default parallel frontend suite produced an intermittent existing async-test failure in different suites across two attempts; rerunning the full suite serially passed all 160 tests. The two affected suites also pass individually.

## Browser UAT

Used Codex’s separate in-app browser tab at `http://127.0.0.1:15189/`, with backend `127.0.0.1:15188` and the isolated QA database above. The user’s open browser tab was not used.

- Confirmed the Home, Research, Explorer, Sources, Reports, and Compare periods destinations render; clicked Compare periods from the shared sidebar and confirmed route change.
- On the actual comparison page, selected two equal 30-day QA periods. The app displayed two comparable app rows; clicking a chart bar opened the source observations with CSV filename, row 2, dates, and `unverified` status. Switching to the full table showed all four fixture rows and kept row-level evidence visible. This fixture has no report links, so no invalid report link appeared.
- Reopened the existing QA opportunity workspace after refresh. The saved decision, rationale, next action, and selected evidence remained. Switched from QA Fixture Alpha to Beta and back; Alpha’s saved state was still present.
- Captured actual browser screenshots in the Codex browser tool output for Home, comparison evidence, and PO decision review. The CUA interface did not expose a supported way to export those screenshot bytes into repository files, so no screenshot files are claimed or included.
- The available browser viewport was approximately 1265 × 712. The browser tool in this session does not expose viewport resizing; **1440 × 900, 1024px, 768px, and 390px are NOT VERIFIED**. Consequently document-level overflow and mobile toggle behavior were covered by targeted component tests and CSS review, not real-device viewport UAT.

## Product Acceptance

- **PO goal:** Find every workspace destination on a phone and reliably inspect saved research evidence and decisions.
- **User journey:** Open the navigation menu → choose the current workspace destination; compare source files → open evidence from chart/table; review a saved decision after refresh.
- **Automated work:** Shared route list/current-page state, accessible close/focus behavior, valid report-link guards, and migration-safe data persistence.
- **Expected result:** All navigation destinations remain available; evidence keeps its source provenance; saved decisions survive migration/restore.
- **Remaining friction:** Real viewport testing at requested widths and PO acceptance with a genuine ChatGPT report remain outstanding. Sensor Tower comparison needs confirmed scope/method/period metadata.
- **Verification:** 147 backend tests, 160 serial frontend tests, TypeScript, production build, migration restore test, and browser checks described above.
- **Decision:** `NEEDS FIX` for final product acceptance until the responsive viewports and owner data are verified.

## Remaining limitations and release recommendation

- No genuine owner-provided structured ChatGPT report was available in the isolated acceptance environment; the report fixture is synthetic QA only.
- The original Sensor Tower file can be explored, but its metadata does not establish all comparable GEO/platform/method/reporting-window facts. Do not enter guessed values; use the owner checklist and obtain a suitable export if the source cannot confirm them.
- Mobile layouts have not been verified at the requested exact viewport widths in a real browser in this session.
- **Technical Acceptance:** PASS (automated backend/frontend checks, build, database integrity, and isolated migration/restore fixture passed).
- **Product Acceptance:** NEEDS FIX (real viewport verification is outstanding).
- **Owner Acceptance:** PENDING (genuine report, source comparability, and PO sign-off remain owner-run).
- **Final release classification:** `RELEASE PENDING VERIFICATION`.
- Implementation commit SHA: pending commit.

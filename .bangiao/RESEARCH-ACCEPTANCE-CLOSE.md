# Research Acceptance Gates — Final Verification

Date: 2026-10-29<br>
Branch: `feat/ux-recovery-01-research-results`<br>
HEAD before this handoff: `5349c58d5913ac3040779446b7ea6d56e4bd8106`

## Outcome

| Gate | Result | Evidence |
|---|---|---|
| Final mobile Browser UAT | **PASS — isolated QA demo only** | Actual Chrome, 390×844 CSS viewport, 100% visual viewport scale, latest QA frontend/backend pair, isolated QA SQLite. No page-level horizontal overflow. |
| Genuine Puzzle 2026 report UAT | **NOT VERIFIED — required artifact unavailable** | Searched the workspace, Codex attachments/remote attachments, Downloads, Desktop and accessible Codex files for `Pasted text(1).txt`; no copy found. No synthetic report was substituted or imported. |
| Frontend tests | **PASS — 235/235** | 26 test files passed after synchronizing one async test with its loaded subject list. |
| TypeScript | **PASS** | `npm run typecheck` |
| Production frontend build | **PASS with advisory** | `npm run build`; Vite reports the main JS chunk is 634.50 kB (over the 500 kB advisory threshold). |
| Backend full suite | **FAIL — 175 passed, 2 migration tests failed** | Exact failures below. No backend files or database schema were changed. |

## Mobile Browser UAT

QA app: `http://127.0.0.1:15319`<br>
QA API: `http://127.0.0.1:15320`<br>
QA report used for interaction verification: `http://127.0.0.1:15319/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d`<br>
Project: `09eb2703-22f3-4ced-aa6f-ee1767e56f9e` (QA Demo project)<br>
Report: `63d931a2-fbb9-4586-b6d6-68874e5d299d` (`[QA DEMO] Puzzle Research — Full Product Walkthrough`)

The report is synthetic QA content and was used only for Task 1 navigation, rendering and interaction checks. It is not evidence for genuine research acceptance. QA SQLite was isolated under `.close-research-qa-20261029`; production SQLite was not used or modified. Pre-existing services on ports 15317/15318 were left running and untouched.

At 390×844, 100% scale, the browser loaded report data before capture and verified:

- Overview, Findings, Entities, Benchmark, Report Notes and Evidence tabs were selectable and rendered their panels.
- Report Notes showed the saved QA note and its saved state.
- Evidence/source region rendered its supplied references as unverified; no source was opened or treated as verified.
- Report data-management disclosure opened and closed.
- Project CSV management opened, its CSV intake disclosure opened and closed, and the panel returned to its collapsed state.
- Benchmark's wide matrix stayed within a contained horizontal scroller; its final column was reachable. The page itself stayed 390 CSS pixels wide.
- At every checked mobile state, `document.documentElement.scrollWidth` and `document.body.scrollWidth` were 390. No page-level horizontal overflow or clipped primary CTA was observed.

Desktop overview was captured at 1440×900. The document measured 1425 CSS pixels wide with a vertical scrollbar, with no horizontal overflow.

### Screenshots

All files below are real captures from the running QA app, not generated mockups:

- [Mobile Overview — 390×844](screenshots/research-acceptance-mobile/01-overview-390x844.png)
- [Mobile Findings — 390×844](screenshots/research-acceptance-mobile/02-findings-390x844.png)
- [Mobile Entity — 390×844](screenshots/research-acceptance-mobile/03-entities-390x844.png)
- [Mobile Benchmark — 390×844](screenshots/research-acceptance-mobile/04-benchmark-390x844.png)
- [Mobile Report Notes — 390×844](screenshots/research-acceptance-mobile/05-report-notes-390x844.png)
- [Mobile Evidence and sources — 390×844](screenshots/research-acceptance-mobile/06-evidence-sources-390x844.png)
- [Report data controls open — 390×844](screenshots/research-acceptance-mobile/07-report-csv-management-open-390x844.png)
- [Project CSV panel collapsed — 390×844](screenshots/research-acceptance-mobile/08-project-csv-collapsed-390x844.png)
- [Project CSV panel expanded — 390×844](screenshots/research-acceptance-mobile/09-project-csv-expanded-390x844.png)
- [Project CSV panel reclosed — 390×844](screenshots/research-acceptance-mobile/10-project-csv-reclosed-390x844.png)
- [Benchmark matrix scrolled to final columns — 390×844](screenshots/research-acceptance-mobile/11-benchmark-scroll-end-390x844.png)
- [Report Notes saved state — 390×844](screenshots/research-acceptance-mobile/12-report-notes-save-status-390x844.png)
- [Desktop Overview — 1440×900](screenshots/research-acceptance-mobile/13-overview-desktop-1440x900.png)

## Genuine report gate

The owner-provided `Pasted text(1).txt` was not available at any accessible searched location. Therefore no parsing, schema validation, import, provenance or real-report results inspection was performed. In particular, this handoff does not claim genuine-report verification for Overview, Findings, Entities, Evidence, Benchmark, quantitative observations or charts.

To close this gate, place the exact owner-provided file at:

`D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\qa-input\Pasted text(1).txt`

or provide another readable local path. The artifact needs to contain the report itself; no replacement fixture is requested.

## Backend test failures

The full backend run previously reported **175 passed / 2 failed**. Re-running the two failures confirmed:

1. `tests/test_database.py::DatabaseMigrationTest::test_historical_research_migrates_restores_and_reopens_through_apis` — asserts the restored DB revision is `20261027_0012`; actual current head is `20261027_0015` after three subsequent additive revisions.
2. `tests/test_database.py::DatabaseMigrationTest::test_upgrade_creates_schema_and_enables_wal_and_foreign_keys` — Alembic autogenerate detects removal of unique index `uq_project_trend_updates_project_subject_id` and addition of a unique constraint over `(project_id, subject_id, id)`. This test remains failing; no migration/model edit was made as part of this acceptance closure.

These are backend migration-test blockers, distinct from the mobile Browser UAT result. They require a scoped migration/test correction before the complete backend suite is green.

## Changes in this close-out

- Frontend test only: wait for the existing-subject list to finish loading before selecting its disabled-until-ready radio. This removes a timing race in the existing `TrendUpdatesPanel` test; no product behavior changed.
- Added the mobile/desktop screenshot evidence above.
- Updated the Recovery Board with the final mobile UAT result and unresolved genuine-report gate.
- No backend, schema, production data, merge or deployment change.

The screenshot run used the current local checkout. The worktree already contained owner/local modifications in `frontend/src/peachyStudio.css` and `scripts/setup.ps1`; those were preserved and are not included in this close-out commit. Therefore screenshots reflect the current checkout including those pre-existing local changes.

## Product Acceptance

- **PO goal:** close final mobile Research Reader acceptance and verify a genuine Puzzle 2026 report.
- **User journey:** mobile report tabs → evidence and saved report notes → open/close report data controls → project CSV data management; desktop overview capture.
- **Automated work:** 235 frontend tests, TypeScript, and production build passed. The test suite now waits for async subject readiness rather than racing it.
- **Expected result:** mobile QA-demo Research flow remains navigable and readable without page overflow; the genuine report gate remains open until its source artifact is accessible.
- **Remaining friction:** genuine report file unavailable; backend full suite has two migration failures; contained benchmark matrix needs horizontal scrolling on narrow screens.
- **Verification:** Chrome screenshots and interactions above are real; only the QA synthetic report was available. Backend test failures are explicitly reported.
- **Decision:** **TECHNICAL PASS for mobile QA-demo UAT; genuine report NOT VERIFIED; overall NEEDS OWNER INPUT / NOT PRODUCT ACCEPTED.**

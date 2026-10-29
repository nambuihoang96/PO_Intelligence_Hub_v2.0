# Project Report Library UX — QA handoff

**Scope:** Project → Báo cáo tab only. The global Reports library and other Project tabs were left unchanged.

## What changed

- Replaced the project-scoped flat rows with a compact Peachy-style report library: clear title/description, report-type summary chips, search and project filter in one toolbar, and report cards with a single prominent open action.
- Report type comes from the saved report status and structured research data: Structured, Một phát hiện, Text-only, or Chưa phân loại. The summary counts remain project-wide when the user searches or filters the visible list.
- Each card shows the saved question/title, supplied GEO/platform/period, import date and only the finding/entity counts actually present in saved structured data. Text-only and unclassified reports say so directly.
- Removed the repeated project-decision link from every report. A compact tracking action appears only when a saved decision is linked to that report.
- Preserved the existing import destination, project filter behavior, report IDs, and global Reports library.

## Real browser QA

Used the running app at `http://127.0.0.1:15313/reports?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e` with the isolated QA database `.research-final-qa-demo-20261029/po_intelligence_hub.sqlite3`. Project: `[QA DEMO] Puzzle Research — US Android 2026`. The three records are explicitly synthetic QA data, not genuine research.

| Check | Result |
|---|---|
| Desktop at 1440×900 shows the library and three differently classified reports | PASS |
| Mobile at 390×844; report cards readable and no page-level horizontal overflow | PASS |
| Search by `text-only` narrows the visible result to one report while project summary remains stable | PASS |
| Open report navigates to the exact existing report ID | PASS — `3dfd648e-67ac-4b9c-b864-7f5c0bd96d1c` |
| Saved data remains unchanged | PASS — presentation-only change; no API/database writes were made during this check |
| Secondary tracking action | Rendered only for a report with a matching saved decision; no duplicate action is shown for unrelated reports |

Browser screenshots are actual captures from the running local app:

- Before, desktop: `screenshots/project-reports-library/before/before-desktop-1440x900.png`
- After, desktop: `screenshots/project-reports-library/after/after-desktop-1440x900.png`
- Before, mobile: `screenshots/project-reports-library/before/before-mobile-390x844.png`
- After, mobile viewport: `screenshots/project-reports-library/after/after-mobile-390x844.png`
- After, mobile cards scrolled into view: `screenshots/project-reports-library/after/after-mobile-report-card-390x844.png`

## Automated verification

- Focused frontend tests: `ResearchIntake.test.tsx` — 49 tests passed.
- TypeScript and production build: passed via `npm run build`.
- `git diff --check`: passed for scoped changes.
- Backend tests were not run; no backend, API, schema, or database code changed.

## Product Acceptance

- **PO goal:** Quickly understand which research reports exist in a Project and open the right one.
- **User journey:** Project → Báo cáo → scan report type/scope/status → search or filter → open the report (or its existing saved-decision tracking view).
- **Automated work:** The screen derives type and counts from persisted report data and keeps summary counts stable while the list is searched.
- **Expected result:** A scannable project report library with direct navigation to the original report, without duplicated decision links.
- **Remaining friction:** Cards intentionally use a single-column rich-list layout to preserve readable titles and metadata. The QA records are synthetic. Owner visual/product acceptance remains pending.
- **Verification:** Desktop/mobile browser captures, search, direct report navigation, focused tests, TypeScript/build as listed above.
- **Decision:** `TECHNICAL PASS` for this scoped implementation; Product Owner review pending. This is not Product Accepted.

## Changed files

- `frontend/src/reports/ResearchIntake.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/reports/ReportLibrary.css`
- `.bangiao/screenshots/project-reports-library/`
- `docs/RECOVERY_BOARD.md`

**Implementation commit:** `47184ebecbe7eb491614f1167358e3978e075113` (`feat(reports): refine project report library`).

## Review follow-up — Project report library, round 2 (2026-10-29)

This is a bounded follow-up to the same G2-02 screen, not a redesign of the global Reports library.

### Changes

- The Project report list now receives report classification, finding count and entity count in the existing list response. This removes the per-report detail request fan-out while preserving the original report IDs and detail route.
- Classification distinguishes structured reports, one-finding reports, text-only reports and records that cannot be classified from available structure. A report with only a supplied executive summary remains structured-partial.
- “Nhập báo cáo” now opens the import panel directly and retains the Project ID, so the PO can paste without an extra navigation action.
- The shared Project context strip is compact only on this report route. Its mobile layout no longer reserves a blank desktop-sized flex row. The global Reports page and other Project tabs were not changed in this round.
- The saved-decision link remains conditional on an explicitly report-linked saved decision; no decision is inferred from project-level state.

### Before / after screenshots

- Before, desktop 1440×900: `screenshots/project-reports-library/round-2/before-desktop-1440x900.png`
- After, desktop 1440×900: `screenshots/project-reports-library/round-2/after-desktop-1440x900.png`
- Before, mobile 390×844: `screenshots/project-reports-library/round-2/before-mobile-390x844.png`
- After, mobile 390×844: `screenshots/project-reports-library/round-2/after-mobile-390x844.png`

### Round 2 verification

- Browser UAT used the running local preview at `http://127.0.0.1:15315/reports?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e` with a copied, isolated QA SQLite database. The app was captured at exact 1440×900 and 390×844. The project library showed its three QA reports and all three report types; mobile document width was 390px with no horizontal page overflow.
- Search narrowed the project list to the one-finding report. Opening the text-only card navigated to its existing report ID `3dfd648e-67ac-4b9c-b864-7f5c0bd96d1c`. The Project CTA opened `/?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e&action=import` with the import content field already visible. Switching the project filter to all showed all five reports in the isolated library.
- Actual QA data contains no report-scoped decision on these three demo records; the conditional Tracking action is covered by the component test and is not claimed as browser-demonstrated on this dataset.
- Frontend: `npm test -- --maxWorkers=1` — 26 files / 233 tests passed. `npm run typecheck` passed. `npm run build` passed; Vite retains its existing advisory for the >500 kB JavaScript chunk.
- Backend: `tests/test_reports.py` — 32 passed, 1 deprecation warning. No database migration or production DB access. Report-summary metadata is derived from saved report JSON in the response schema; original content, benchmarks and PO data are untouched.
- `git diff --check` passed for the task changes.

### Product Acceptance — round 2

- **PO goal:** identify the reports already in a Project and continue with the right one without technical setup.
- **User journey:** Project → Báo cáo → distinguish report type → search/filter → open the same report, or click Nhập báo cáo and paste directly in that Project.
- **Automated work:** derive list labels/counts from persisted structure, avoid N+1 detail requests, and preserve the project context for direct import.
- **Expected result:** three report types and their truthful summaries are scannable, report navigation keeps the original ID, and import starts immediately in the selected Project.
- **Remaining friction:** QA records are synthetic, not research truth. No report-scoped decision exists in the QA project to demonstrate the conditional Tracking action in browser.
- **Verification:** real browser screenshots, desktop/mobile layout, search, filter, report navigation, direct import entry, frontend/backend tests, TypeScript and production build as listed above.
- **Decision:** `TECHNICAL PASS`; owner visual/product review remains pending. This is not Product Accepted.

**Round 2 implementation commit:** `48712e5` (`fix(reports): refine project report library UX`).

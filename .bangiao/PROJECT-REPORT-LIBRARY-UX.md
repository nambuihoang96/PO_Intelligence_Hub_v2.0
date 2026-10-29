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

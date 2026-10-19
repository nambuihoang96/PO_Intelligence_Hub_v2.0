# UX-RECOVERY-01 — Phase 2 Product Review Fix

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- HEAD before this review fix: `dd1339bc9c0a7cb2539d9db94111fb693ca0a296`
- Earlier review reference: `ed4679b62fb5f45aac3df858bd7b2da11c19ebd4`
- Implementation commit: `a9816dbf9dbd0c96ed905e88395fd24c8c15bedd`
- Product review: **NEED RE-REVIEW**. The owner’s NEED FIX items were implemented; no independent product reviewer was run for this delivery.

## UX changes

- Replaced four large metadata cards with a compact title, scope/status/provenance line and a back link. Finding/entity/source/gap counts are inside the collapsed “Report details” disclosure.
- Moved report-supplied Key Findings before the executive summary. The summary is clamped to three lines by default and can be expanded; the source text remains unchanged. Quantitative absence is a small “Qualitative research · No quantitative dataset linked” note.
- Collapsed the text-only structuring form behind a clear disclosure so it does not push the report navigation down.
- Replaced the long accordion list with an Insight list and contextual detail panel. Evidence references remain marked unverified; source excerpts only appear when the report has a supplied location.
- Kept PO Assessment as its own workflow. Benchmark stays tied to explicitly selected subjects, shows Unknown for missing observations, and labels a single selected subject as an assessment rather than an empty comparison.
- No backend, database schema, migration, report content, or Research Run changes were made.

## Before / after

- **Before:** A tall report header, four prominent count cards, and a large quantitative-data placeholder consumed the first screen; findings began after these sections.
- **After:** The compact header and tabs lead directly into report-supplied findings. A live 1280×720 browser capture shows the first two finding cards in the initial viewport. The summary and supplementary counts are secondary.

## Files changed

- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/style.css`
- `.bangiao/screenshots/ux-recovery-01-phase2/01-overview-1280x720.jpg`
- `.bangiao/screenshots/ux-recovery-01-phase2/02-insight-detail-1280x720.jpg`
- `.bangiao/screenshots/ux-recovery-01-phase2/03-benchmark-1280x720.jpg`
- `.bangiao/screenshots/ux-recovery-01-phase2/04-po-assessment-saved-1280x720.jpg`
- `.bangiao/screenshots/ux-recovery-01-phase2/05-po-assessment-unsaved-1280x720.jpg`
- `.bangiao/screenshots/ux-recovery-01-phase2/06-po-assessment-after-refresh-1280x720.jpg`
- `.bangiao/UX-RECOVERY-01-PHASE2.md`

Pre-existing changes in `scripts/setup.ps1` and `.devcrew/` were preserved and excluded from the implementation commit.

## Test results

- Frontend tests: **36 passed, 0 failed** (3 test files).
- TypeScript check and Vite production build: **passed**.
- Backend regression suite: **63 passed**; Alembic reported no new upgrade operations. Tests ran with `APP_DATA_ROOT` pointed at a temporary workspace directory. The ordinary sandbox initially blocked the TestClient socketpair; the suite passed after allowing local test sockets.
- `git diff --check`: **passed**.

## Browser UAT

Used the actual imported DIY Game report (`Các game DIY tạo động lực như nào cho người chơi`) in the Codex in-app browser at `http://127.0.0.1:15175/reports/6a73b8bf-01d6-4954-a72d-f165bd2c1d9e`.

- Overview loaded fresh with Key Findings first; no quantitative chart or invented metric appeared.
- Opened a finding and reviewed its supplied scope, PO implication, uncertainty, and source links. The links remained labelled unverified.
- Benchmark displayed two selected report subjects, research-supplied dimensions and an Unknown observation.
- Edited the finding’s PO Assessment in the isolated UAT SQLite copy, saw Unsaved, saved, reopened the report, and confirmed the value survived refresh. Restored the copy’s original assessment afterward.
- Browser CSS viewport was **1280×720**. At this viewport the document/body width was 1265 CSS pixels and did not overflow horizontally; the comparison table scrolls within its own container.
- Screenshots are actual captures saved in `.bangiao/screenshots/ux-recovery-01-phase2/`.
- **NOT VERIFIED:** exact 1440×900, 1024, 768 and 390 viewport checks. The in-app browser has no viewport resize control. No mobile screenshot is claimed.
- The request to open the screenshot via the GitHub web URL returned a cache miss; the checked-out `.bangiao/UX-RECOVERY-01-preview.png` was inspected locally.

Production SQLite was not used for UAT writes. The isolated copy was restored to its pre-test PO Assessment value.

## Known limitations

- The in-app browser could not be resized to the requested desktop and mobile dimensions.
- The source excerpts can be opened only when report data supplies a reliable line location; no location is synthesized.
- Findings, source references and PO implications remain report-supplied and unverified.

## Review status

**NEED RE-REVIEW** by the Product Owner. This report does not claim the owner’s final approval or an independent Product Reviewer GO.

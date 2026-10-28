# G2-02 and G1-03 continuation — 2026-10-28

## Scope and status

- G2-02 is technically complete for the Project → Report → Project journey on isolated QA; owner review remains pending.
- G1-03 has a scoped Peachy Studio first pass applied directly to Project Home and Report Reader. It is `DEV_IMPLEMENTED`, not Product Accepted. No styling was rolled out to other product screens.

## Environment diagnosis

- A minimal Python HTTP server was tested independently of PO Hub, Uvicorn and SQLite.
- In the restricted command context, the process opened a `127.0.0.1:15311` listener, but its same-context HTTP request timed out and Browser Use returned a connection timeout.
- The identical probe running through Windows-host execution returned `QA_HTTP_OK` and opened in Browser Use. This is evidence of process/network isolation between execution contexts, not an application startup defect.
- QA Uvicorn logs show application startup completed. The frontend and backend were run on `15310` and `15311`, with `APP_DATA_ROOT=.peachy-g1-qa-20261028`. Existing QA listeners were inspected and left untouched. Production SQLite was not used.

## Browser verification

- Browser Use opened `[QA] Peachy Studio UAT` and report `fb238ad0-53b7-4213-bfaa-143244780dd4`.
- The report's Project link returned to the same Project ID. Project Home showed the same report title in saved reports and recent activity. The three primary Vietnamese actions were visible.
- The report was reopened in Browser Use and retained its Project context and report content.
- At the available 375px browser width, Project Home and Report Reader were visually reviewed. No horizontal page overflow or overlapping primary actions was visible in the captured views.
- Screenshots from the running QA app:
  - `.bangiao/screenshots/g1-03-peachy/project-home-mobile-375.png`
  - `.bangiao/screenshots/g1-03-peachy/report-reader-mobile-375.png`
- Exact 390px and 1440px browser UAT are **NOT VERIFIED**. Browser Use exposes a 375px viewport in this environment. A separate Chrome headless desktop capture exited `-2147483645` and produced no image; a stale loading-state artifact was removed and is not presented as evidence.
- The QA report is an explicitly synthetic fixture. No genuine owner research report was used in this pass.

## Verification

- Frontend full suite, serial: **26 test files / 221 tests PASS**.
- Focused `ProjectHome` and `ResearchIntake` suites: **2 files / 45 tests PASS**.
- Backend `test_reports_library_and_project_filters_share_records_and_linking_preserves_report_data`: **1 targeted test PASS** using isolated test SQLite. A broader two-module run was started but did not complete in the available shell session; no backend files changed in this slice.
- TypeScript: **PASS**.
- Production build: **PASS**, with the existing Vite advisory for a 617.36 kB JS chunk.
- `git diff --check`: **PASS** for the committed implementation and current documentation edits.

## Files in this milestone

- `frontend/src/main.tsx`
- `frontend/src/peachyStudio.css`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/screenshots/g1-03-peachy/project-home-mobile-375.png`
- `.bangiao/screenshots/g1-03-peachy/report-reader-mobile-375.png`
- `.bangiao/milestones/G1-03-REVIEW.md`

## Product Acceptance

- **PO goal:** Start and continue research from one Project home, open a saved report, and return to the same Project without losing context.
- **User journey:** Project Home → open the saved report → review the report → return to the same Project.
- **Automated work:** Existing routes preserve Project/report IDs; shared scoped Peachy tokens style the two approved first screens.
- **Expected result:** Clear Vietnamese Project actions and a warm, consistent Project/Report experience while preserving report behavior.
- **Remaining friction:** Desktop visual comparison at 1440px, exact 390px mobile review, and genuine report acceptance remain open. Report Reader structure still differs from the approved mockup.
- **Verification:** Isolated browser journey at 375px; 221 frontend tests; TypeScript and production build.
- **Decision:** G2-02 `TECHNICAL PASS / OWNER REVIEW PENDING`; G1-03 `DEV_IMPLEMENTED / BROWSER UAT PARTIAL`; no Product Pass claimed.

## Commits

- G1-03 code and real 375px screenshots: `5f8fc96`.
- Recovery Board and milestone record: recorded in the following documentation commit.

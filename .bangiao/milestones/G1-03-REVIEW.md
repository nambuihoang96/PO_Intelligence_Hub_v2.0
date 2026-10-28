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

## Feedback round — first-screen refinement and exact browser review — 2026-10-28

### Changes in this round

- Project Home keeps its three approved Vietnamese actions while using shorter descriptions, removing the duplicate header report shortcut and repeated “open latest report” panel, and showing report titles over up to two lines.
- The PO decision panel now uses the available width instead of placing its primary action in a narrow second column.
- Text-only reports no longer show an empty zero-count snapshot, an empty PO next-step panel, or a large quantitative-empty card. The original report and “Bổ sung kết quả có cấu trúc” workflow remain accessible.
- Project navigation and Report Reader shells use compact Peachy-scoped layout rules at desktop and mobile sizes. Existing report, benchmark, evidence and PO persistence behavior is unchanged.

### Actual browser evidence

- QA runtime: Vite `127.0.0.1:15310` (PID `45740`) and Uvicorn `127.0.0.1:15311` (PID `43892`); host requests to `/` and `/openapi.json` returned HTTP 200. QA data root: `.peachy-g1-qa-20261028`; no production database opened.
- A standalone fixed-response Python HTTP server on `127.0.0.1:15312` (PID `42952`) returned HTTP 200 to Windows host and rendered `MINIMAL_QA_OK` in Browser Use. It was stopped after the probe. This rules out a general localhost restriction in the current Browser Use/host path; the earlier timeouts were tied to the restricted command context.
- Chrome exercised Project Home → the report link → Project Home at both 1440×900 and 390×844. The report ID remained `fb238ad0-53b7-4213-bfaa-143244780dd4`; Project ID remained `950d908b-ad16-4719-9955-859d820a9101` after return. No page errors, horizontal overflow, or broken links were observed.
- Browser Use independently loaded the same QA Project Home and exposed the three primary actions and the saved report.
- Screenshot artifacts (real running app):
  - Before: `.bangiao/screenshots/g1-03-peachy/before/project-home-1440x900.png`, `project-home-390x844.png`, `report-reader-1440x900.png`, `report-reader-390x844.png`.
  - After: `.bangiao/screenshots/g1-03-peachy/after/project-home-1440x900-viewport.png`, `project-home-1440x900-full.png`, `project-home-390x844-viewport.png`, `project-home-390x844-full.png`, and corresponding `report-reader-*` captures.
- Document width matched the viewport at 1440px and 390px. Full-page heights: Project Home 1510→1410 (desktop), 2656→2358 (mobile); Report Reader 1274→931 (desktop), 1860→1119 (mobile).

### Visual comparison and limits

- Improved: warm Peachy background and sidebar, compact project/report context, three clear Project actions, report identity/status, less duplicate navigation, and the text-only state’s next step.
- Still different: the app’s shell and Results tab structure remain unlike the mockup composition. The isolated database contains only one clearly labeled text-only QA report and no structured qualitative report, so the visual layout of populated finding/evidence cards is **NOT VERIFIED**. The synthetic report was not augmented with invented findings or metrics.
- The approved Peachy references remain the design authority. This round is limited to Project Home and Report Reader; it does not claim full G1-03 visual completion or owner/product acceptance.

### Verification

- Frontend: 26 test files / 224 tests PASS.
- TypeScript: PASS.
- Production build: PASS; existing Vite warning for a JavaScript bundle above 500 kB remains.
- Backend Project/Reports linking and persistence regression: 1 targeted test PASS on isolated test SQLite.
- Browser UAT: Project → Report → Project PASS at desktop and mobile; text-only sample only. Structured-report visual acceptance and genuine report acceptance are NOT VERIFIED.
- UI UX Pro Max skill was read and applied to information hierarchy, focus visibility and responsive/no-overflow review.

### Current decision

- G2-02 scoped continuity: `DEV_DONE / OWNER REVIEW PENDING`.
- G1-03 first-screen work: `DEV_IMPLEMENTED / BROWSER UAT PASS for available text-only QA state; structured-report visual review NOT VERIFIED`.
- Product decision: `NEEDS OWNER REVIEW`; no Product Pass claimed.
- First-screen refinement implementation: `7581d77` (`fix(g1-03): refine Peachy project and report screens`).
- This feedback-round Recovery Board/milestone update is committed separately.

### Feedback round 2 — Project Home first-screen hierarchy — 2026-10-28

- **Owner direction:** Continue G2-02/G1-03 using the approved Peachy Studio assets already in the repository. Apply the design to the running product; do not create a prototype-only substitute or request the supplied inputs again.
- **Issue found:** The generic page heading “Tổng quan dự án” duplicated the selected project identity and added avoidable vertical space before the three primary Project Home actions.
- **Change:** The generic heading is now suppressed only for the selected Project Home root; the actual project name is the page-level `h1`. Other routes and the three primary actions are unchanged. The secondary “Lưu thông tin mới” and “Phân tích dữ liệu” shortcuts were removed because they duplicated the primary actions; saved subject and CSV rows remain individually accessible. This is a bounded frontend-only hierarchy correction.
- **Actual browser evidence:** QA frontend at `http://127.0.0.1:15310/research?projectId=950d908b-ad16-4719-9955-859d820a9101`, 1280×720. Real captures: `.bangiao/screenshots/g1-03-peachy/round-2/project-home-top-1280x720.png` and `.bangiao/screenshots/g1-03-peachy/round-2/report-reader-text-only-1280x720.png`. They were captured before the final off-screen duplicate-shortcut removal and show the first viewport, which is unchanged by that cleanup. Document width 1265px does not exceed the 1280px viewport. Report Reader retains the original text-only report and does not expose raw JSON. Exact 390px/1440px were not recaptured in this round. Browser Use re-entry after the final patch returned `browser.user is unavailable`; a hidden Chrome headless attempt exited `-2147483645` and created no screenshot.
- **Skill use:** Read the installed UI UX Pro Max skill and ran focused queries for React composition, responsive UX, keyboard navigation and focus states. Used the applicable guidance as review criteria; retained the PO-approved Peachy palette rather than applying an unrelated generated design-system suggestion.
- **Tests:** After the final cleanup: frontend 26 files / 224 tests PASS, including a ProjectHome assertion that the primary action URLs appear once and duplicate shortcuts are absent; TypeScript PASS; production build PASS (existing large-chunk advisory); `git diff --check` PASS. No backend or data changes.
- **Limitations:** The QA database has no genuine structured qualitative report. Populated findings/evidence fidelity is NOT VERIFIED. This round does not claim full G1-03 completion or Product Acceptance.
- **Product Acceptance:** **PO goal:** make a Project the clear starting place for research and saved outcomes. **User journey:** open Project → choose one of three primary actions → reopen saved report in the same Project. **Automated work:** preserve contextual links and remove repeated shortcuts. **Expected result:** Project identity and primary actions are immediately clear; saved work remains reachable. **Remaining friction:** genuine structured report not present in QA; latest below-fold CTA cleanup not reverified in browser. **Verification:** frontend tests/typecheck/build and actual 1280×720 app screenshots from before the final below-fold-only cleanup. **Decision:** `TECHNICAL PASS / PRODUCT REVIEW PENDING`.
- **Status:** `DEV_IMPLEMENTED / prior text-only browser state PASS; final CTA cleanup BROWSER NOT VERIFIED / structured-report visual review NOT VERIFIED / owner review pending`.

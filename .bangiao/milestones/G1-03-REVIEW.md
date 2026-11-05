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
- **Actual browser evidence:** QA frontend at `http://127.0.0.1:15310/research?projectId=950d908b-ad16-4719-9955-859d820a9101`. Saved real captures at 1280×720: `.bangiao/screenshots/g1-03-peachy/round-2/project-home-top-1280x720.png` and `report-reader-text-only-1280x720.png`; they show the unchanged first viewport. Host GETs to frontend `15310` and backend `15311` returned 200. After a stale browser binding failed, opening a fresh Codex tab restored browser control; no port changes or process kills were needed. At 390×844 and 1440×900, Project Home and Report Reader were visually inspected. Widths: 390 viewport/document 375; 1440 viewport/document 1425; no horizontal overflow. Project Home had one page title and three primary actions with duplicate shortcuts absent. Project → same report → same Project navigation passed at 390; after refresh the report/project context remained, raw JSON was hidden, and console errors were empty. Exact 390/1440 screenshots were rendered and reviewed inline but not saved as repository images. A separate headless Chrome attempt had a CSS viewport mismatch; its cropped artifacts are excluded from delivery.
- **Skill use:** Read the installed UI UX Pro Max skill and ran focused queries for React composition, responsive UX, keyboard navigation and focus states. Used the applicable guidance as review criteria; retained the PO-approved Peachy palette rather than applying an unrelated generated design-system suggestion.
- **Tests:** After the final cleanup: frontend 26 files / 224 tests PASS, including a ProjectHome assertion that the primary action URLs appear once and duplicate shortcuts are absent; TypeScript PASS; production build PASS (existing large-chunk advisory); `git diff --check` PASS. No backend or data changes.
- **Implementation commit:** `2895067ceaef19d14036e64d48e2383227bb6dca` (`fix(g1-03): simplify project home actions`).
- **Limitations:** The QA database has no genuine structured qualitative report. Populated findings/evidence fidelity is NOT VERIFIED. Exact 390/1440 screenshots were not saved as files. This round does not claim full G1-03 completion or Product Acceptance.
- **Product Acceptance:** **PO goal:** make a Project the clear starting place for research and saved outcomes. **User journey:** open Project → choose one of three primary actions → reopen saved report in the same Project. **Automated work:** preserve contextual links and remove repeated shortcuts. **Expected result:** Project identity and primary actions are immediately clear; saved work remains reachable. **Remaining friction:** genuine structured report not present in QA; exact 390/1440 images were not persisted as files. **Verification:** frontend tests/typecheck/build, saved 1280×720 captures, and live 390×844/1440×900 Project→Report→Project/refresh UAT. **Decision:** `TECHNICAL PASS / PRODUCT REVIEW PENDING`.
- **Status:** `DEV_IMPLEMENTED / text-only browser UAT PASS at 390×844, 1280×720 and 1440×900 / structured-report visual review NOT VERIFIED / owner review pending`.

### Feedback round 4 — v4 desktop finding-to-tracking flow — 2026-11-03

- **Owner direction:** “làm luôn cái wireframe v4 đi nha. Tự làm tự đánh giá chất lượng bao giờ xong thì thôi anh đi ăn đã”. Mobile remains out of scope.
- **Scope:** Continue G1-03 using the approved v4 workflow in the current application. Reopen the finding/report return path and six-state task progression under G2-03/G4-02; no new monitoring service or standalone mockup page.
- **Changes:** Report finding follow-up saves at the reading context and retains the exact finding target. Tracking has explicit task vs report-update navigation, readable source context, and six saved progress states. Project Home surfaces the earliest active tracked item. PO decision editor now has a contextual top return to the exact finding; without a report target, it returns to the task list. Changing progress does not alter the saved PO decision. No schema migration was added.
- **Verification:** Frontend **31 files / 275 tests PASS**; focused report/tracking/decision suite **6 files / 94 tests PASS**; TypeScript and build PASS (748.14 kB chunk-size advisory); targeted backend workflow-preservation test **1 PASS**. `git diff --check` is recorded after the final documentation check.
- **Runtime limitation:** The active local browser tabs at `127.0.0.1:5173` and `:15325` refused connections, and CUA could not bind the existing user tab. An isolated QA DB copy migrated; preview remained unreachable, and the copy was removed. No screenshot or Browser UAT is claimed. Production SQLite was not opened or changed; no AI request/quota used.
- **Product Acceptance:** **PO goal:** keep the exact report/finding context while saving and updating a work item. **Journey:** report finding → optional next step/review date → save in place → Tracking → update progress → return to exact finding. **Automated work:** preserve target identity, save workflow progress independently from the PO decision, and keep report comparison separate. **Expected result:** the PO can identify the tracked finding and has a clear route back without assuming automatic market monitoring. **Remaining friction:** live desktop visual review and screenshots, two-tab conflicts, genuine long report coverage, and the complete A01–A28 matrix remain open. **Verification:** automated checks above; no Browser UAT. **Decision:** `TECHNICAL PASS / BROWSER UAT NOT VERIFIED / OWNER REVIEW PENDING`; not Product Pass.
- **Next:** Complete one real desktop browser smoke and capture the running application at 1440×900 before marking this cross-screen rollout ready for owner review.

### Feedback round 4 continuation — repeat research and manual update paths — 2026-11-03

- **Change:** The report-update screen now offers “Nghiên cứu lại cùng câu hỏi” with the same project, saved question, GEO, platform and source report, plus “Ghi nhận thủ công” that asks the PO to choose the exact tracked item before opening its inline update form. Saving creates a dated, explicitly PO-entered and unverified history entry. One-report empty state tells the PO to choose a new period and save a second report in the same project; it states that PO Hub does not search the Internet.
- **Verification:** Focused report-update/tracking tests **2 files / 18 tests PASS** after final copy change. Full serial frontend suite **31 files / 277 tests PASS** on the immediately preceding implementation state; the final text-only empty-state change is covered by the focused suite. TypeScript and production build passed after that change; Vite retains a 751.36 kB chunk advisory. The concurrent run had 3 failures under load (2 heavy CSV timeouts and 1 manual-route test), all passed in serial execution. No AI call/quota was used.
- **Browser evidence:** Actual isolated QA app at 1280×720. Same-tab research-again preserved the source/question context. Manual update opened the exact candidate’s form, saved a QA-only unverified note and displayed its date/source provenance in Tracking. The final single-report empty state was visually inspected inline. Only one fixture report exists; real two-period change detection is **NOT VERIFIED**. Screenshot was not exported as a file; 1440×900 was unavailable.
- **Product Acceptance:** **PO goal:** repeat a saved study or manually record an observation against the correct tracked item. **User journey:** report updates → repeat question and save a new-period report, or choose a tracked item → record date, observation and source. **Automated work:** preserve context and append a PO-owned unverified record. **Expected result:** the PO can find the exact tracked item and understand how a second report becomes comparable. **Remaining friction:** genuine second-period comparison, 1440×900 visual evidence, full v4 screen-by-screen parity and owner review remain open; no Internet monitoring is performed. **Verification:** focused tests, serial regression run on the preceding implementation, final typecheck/build, and isolated desktop browser UAT. **Decision:** `TECHNICAL PASS / SCOPED BROWSER UAT PASS / NEEDS FIX FOR FULL V4 ACCEPTANCE`; no Product Pass claimed.
- **Status:** G1-03 remains `REWORK`; do not mark the complete wireframe v4 rollout ready or accepted from this slice alone.

### Feedback round 4 continuation 2 — one-screen research-again flow — 2026-11-03

- **Owner feedback:** The repeat-research route still had an unnecessary intermediate screen and made the PO unsure where the ChatGPT result should go. Desktop only.
- **Change:** The existing report's question and scope are carried into one research-again screen. It shows the old report context, asks for a distinct new period, builds an editable prompt, offers one copy action, and shows the new-report paste/save panel on the same screen. The saved report keeps the old report as its lineage and opens with the exact previous report selected for comparison. A missing source report, missing new period, or repeated period is blocked. The standard intake flow was left intact.
- **Automated verification:** Focused frontend suite: **3 files / 74 tests PASS** (`ResearchIntake`, `ReportUpdateComparison`, `TrackingWorkspace`). TypeScript: **PASS**. Production build: **PASS** with Vite's **758.57 kB** chunk advisory. `git diff --check`: **PASS**, with line-ending notices only. No AI call/quota used.
- **Actual browser review:** Isolated QA app, project `Puzzle` (`897a61dd-f7a6-42b9-ad50-7301cf648fe5`), prior report `47452361-7c16-48ea-aa89-df8469db681d`, 1280×720. Visually reviewed the single-screen form and lower paste/save area, confirmed the old report/question context, new period, editable prompt, one copy action and result field. Clicking copy retained the same tab and exposed the next-step guidance; no external ChatGPT tab was opened. Save was intentionally not clicked, so no new test report was produced. No screenshot was exported; no 1440×900 capture. The browser data is QA-only, not a genuine market report.
- **Review outcome:** The one-screen copy/paste loop now matches the intended repeat-research journey and the automated checks pass. It does not prove that a genuine second-period report will produce a useful comparison. Full desktop wireframe A01–A29 review and genuine two-report comparison remain open. This app does not perform Internet monitoring.
- **Product Acceptance:** **PO goal:** rerun a saved question for a new period and open a deliberate comparison with the old report. **User journey:** old report → repeat question → choose new period → copy once → paste once → save → compare exact pair. **Automated work:** retain project/source, update prompt context, reject duplicate periods and select the exact old report for comparison. **Expected result:** one saved new-period report linked to the old report. **Remaining friction:** no real second-period content, full wireframe parity, 1440×900 screenshot, and owner review. **Verification:** 74 focused tests, typecheck/build and isolated 1280×720 Browser UAT. **Decision:** `TECHNICAL PASS / SCOPED BROWSER UAT PASS / NEEDS FIX FOR FULL V4 ACCEPTANCE`; not Product Pass.
- **Status:** G1-03 remains `REWORK`; this is a verified improvement to one workflow, not completion of the full wireframe v4 rollout.

### Feedback round 4 continuation 3 — no empty relationship map; Vietnamese report labels — 2026-11-03

- **Review finding:** Overview still used the confusing “Bản đồ nghiên cứu” label, displayed empty finding-to-entity placeholders, and exposed English finding/status labels.
- **Change:** Renamed the block to “Liên hệ trong báo cáo” and render it only for findings that have a real source-provided entity link. The expand count covers only linked findings. Known finding taxonomy and evidence status labels are localized; unknown enum-like strings display “Phát hiện nghiên cứu”. Source content, evidence and provenance remain unchanged.
- **Automated verification:** Focused frontend suite: **3 files / 75 tests PASS**. TypeScript: **PASS**. Production build: **PASS**, Vite chunk-size advisory **759.16 kB**. Earlier `git diff --check` found no whitespace errors (only line-ending notices); it will be repeated after this doc edit. First focused run had three stale assertions about English casing and empty relation rows; expectations were updated to the approved v4 behavior, and the final run passed.
- **Actual desktop review:** Isolated app at `127.0.0.1:5174`, QA project `Puzzle`, 1280×720. Reviewed report overview screenshot and accessibility state: stable six-item report tab order; “Liên hệ trong báo cáo” displayed actual relationship rows; no blank map was shown for unrelated findings; evidence status and finding category displayed in Vietnamese. Checked Tracking and report updates for exact finding/source, next action, review date, clear no-second-report explanation, repeat-research path and manual update entry point. Research-again stayed on the same tab; after copying, the one-pass instruction appeared; the paste area and save action remained on the same page. No report or PO update was saved during this pass. QA only; no genuine second-period comparison or 1440×900 capture.
- **Scope:** Desktop only. Mobile criteria A16 and A29 remain out of scope per PO.
- **Product Acceptance:** **PO goal:** understand a finding's real links and navigate among report, Tracking and update flows without decoding internal labels. **User journey:** report overview → finding → project Tracking → updates → repeat the same question or record manually. **Automated work:** suppress nonexistent map rows and translate product-facing metadata. **Expected result:** truthful, understandable labels and clear project context. **Remaining friction:** full desktop A01–A15/A17–A28 traceability, 1440×900 evidence and genuine two-period output remain open. **Verification:** 75 focused tests, typecheck/build, actual 1280×720 desktop review. **Decision:** `TECHNICAL PASS / SCOPED BROWSER UAT PASS / NEEDS FIX FOR FULL V4 ACCEPTANCE`; not Product Pass.
- **Status:** G1-03 stays `REWORK`. This correction does not close the whole v4 scope.

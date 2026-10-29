# Report Reader Final Recovery + Research Demo

**Date:** 2026-10-29
**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `35975b6c0293999b7eed353882f2acc78d33a296`
**Status:** `TECHNICAL PASS (QA DEMO WORKFLOW) / GENUINE REPORT NOT VERIFIED / FINAL MOBILE VISUAL NOT VERIFIED / OWNER ACCEPTANCE PENDING`

## Root causes addressed

- Qualitative Report Reader presented CSV/data management too prominently, although no quantitative dataset was linked. The screen now presents a compact qualitative status and leaves report data management collapsed.
- QA source URLs use the reserved `.invalid` domain. They previously looked like ordinary clickable sources. The report viewer now labels these as unavailable QA fixtures and does not render them as source links. `line:N` is presented as “Vị trí trong báo cáo · dòng N”.
- Existing demo data was too sparse for a product walkthrough. The isolated QA seeder now adds a long-form, clearly synthetic report using the existing API and schema, without replacing existing reports, project decisions, benchmark selections, or PO notes.

## Changes

- `frontend/src/reports/ReportResults.tsx`: compact qualitative status and progressive disclosure for dataset management; clearer source-location labels; explicit unavailable fixture URL presentation.
- `frontend/src/reports/MarkdownReport.tsx`: reject `.invalid` hosts as link targets while keeping the original report content visible.
- `frontend/src/style.css` and selected mobile rules in `frontend/src/peachyStudio.css`: compact Report Reader data status and responsive report header/read layout.
- `frontend/src/reports/ResearchIntake.test.tsx`: focused assertions for qualitative data state, source status and report line labels.
- `scripts/seed_research_qa_demo.py`: idempotent Golden Demo report, using the current API/schema and preserving existing saved work.
- `tests/test_research_qa_golden_demo.py`: verifies report depth, schema validity, explicit synthetic status, source line references, unverified status and lack of quantitative values.
- `docs/RECOVERY_BOARD.md`: G2-04 progress and evidence recorded; genuine report acceptance remains open.

No database schema, backend architecture, production SQLite data, Research Run, original report, or report ID was changed. Golden Demo data was seeded only in `.research-final-qa-demo-20261029-current-code/po_intelligence_hub.sqlite3`.

## Golden Demo entry points

- QA app: [http://127.0.0.1:15317](http://127.0.0.1:15317)
- Project Home: [QA Demo Project](http://127.0.0.1:15317/research?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e)
- Golden report Overview: [Full Product Walkthrough](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d)
- Findings: [Golden Demo findings](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=insights)
- Entities: [Golden Demo entities](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=entities)
- Benchmark: [Golden Demo comparison](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=benchmark)
- Report notes: [Report-level notes](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=decisions)
- Evidence: [Golden Demo evidence](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=evidence)
- Full report: [Original Markdown](http://127.0.0.1:15317/reports/63d931a2-fbb9-4586-b6d6-68874e5d299d?section=report)
- Tracking: [Project decision](http://127.0.0.1:15317/tracking?projectId=09eb2703-22f3-4ced-aa6f-ee1767e56f9e)

These endpoints use isolated QA data only and are not shareable outside the local machine.

## Browser UAT — QA fixture only

| Flow | Result | Evidence |
|---|---|---|
| Project Home opens in the persistent QA project context | PASS | Browser accessibility tree showed the QA project name and the three contextual destinations. |
| Structured Golden Report opens with supplied overview, takeaways and findings | PASS | Five report-supplied findings, four synthetic concept entities, four gaps and qualitative-only status were visible. |
| Qualitative report does not open CSV import by default or show zero-valued analytics KPI cards | PASS | Overview showed a compact “Nghiên cứu định tính · Chưa liên kết bộ dữ liệu định lượng” notice; import remained collapsed. |
| Findings expose evidence status, source location, uncertainty and report recommendation | PASS | Finding detail showed `unverified`, `Vị trí trong báo cáo · dòng N`, uncertainty and report-provided PO implication. |
| QA `.invalid` references are not presented as real evidence links | PASS | Evidence showed “Liên kết fixture QA · không truy cập được · không phải bằng chứng thật”; original report text remains visible. |
| Entities and Benchmark retain selected subjects, dimensions and missing values | PASS | Browser showed two selected QA concepts, qualitative dimensions and explicit missing states. |
| Report note and Project Decision are distinct | PASS | Report notes showed the saved report-level note; Tracking showed the separate Project decision, next action and review date. |
| Refresh/reopen preserves the QA report note | PASS | Reload retained the exact report-level note. |
| Text-only report does not create findings from headings | PASS | Text-only report rendered its honest structure-needed state, with no fabricated finding cards. |
| Final 390×844 after the last responsive CSS correction | NOT VERIFIED | A separate headless browser capture did not reach a stable project-loaded state; connected browser viewport override is unavailable. Earlier actual 390×844 screenshots are retained but are not proof of the final correction. |
| Genuine owner research report | NOT VERIFIED | No accessible copy of either owner-named report was found in the workspace. The synthetic Golden Demo is not a substitute. |

### Screenshots

Captured from the running local QA application. Desktop captures are the current real browser views. Earlier 390×844 captures are retained as pre-final-correction visual evidence; do not treat them as final mobile acceptance.

- [Overview desktop 1440×900](screenshots/report-reader-final-recovery/overview-desktop-1440x900.png)
- [Overview mobile 390×844 — pre-final correction](screenshots/report-reader-final-recovery/overview-mobile-390x844.png)
- [Findings desktop 1440×900](screenshots/report-reader-final-recovery/insights-desktop-1440x900.png)
- [Findings mobile 390×844 — pre-final correction](screenshots/report-reader-final-recovery/findings-mobile-390x844.png)
- [Entities desktop 1440×900](screenshots/report-reader-final-recovery/entities-desktop-1440x900.png)
- [Evidence desktop 1440×900](screenshots/report-reader-final-recovery/evidence-desktop-1440x900.png)
- [Benchmark desktop 1440×900](screenshots/report-reader-final-recovery/benchmark-desktop-1440x900.png)
- [Report notes desktop 1440×900](screenshots/report-reader-final-recovery/decisions-desktop-1440x900.png)
- [Full report desktop 1440×900](screenshots/report-reader-final-recovery/report-desktop-1440x900.png)

## Visual comparison: approved Peachy reference → actual QA screenshot

| Reference intent | Actual screenshot | Remaining difference |
|---|---|---|
| Findings and evidence read as report content, with source state available without implying verification | Overview and findings desktop captures show the source status and uncertainty in the report flow | The existing reading layout still has separate left section navigation and right support area; it is denser than the two-column Peachy reference and remains a broader visual-review item. |
| Entity / Benchmark has clear selected subjects and evidence-grounded comparison | Benchmark capture shows selected QA subjects, dimensions and missing observations | The comparison includes editing controls from the existing product workflow; it is not a purely read-only editorial matrix. No fake values were added. |
| Qualitative-first view without a dominant CSV panel or empty KPI dashboard | Overview capture shows a compact qualitative notice and collapsed data action | Some secondary report metadata/support remains visible on desktop. It does not block the report overview. |
| Mobile report content remains readable at 390px | Prior mobile captures show actual QA content and no page-level scrollbar was reported | Because the final post-correction mobile capture did not reach stable data, clipping/wrapping after the last CSS update is `NOT VERIFIED`. |

## Automated verification

- Frontend: **26 test files, 235 tests PASS** (`npm run test -- --maxWorkers=1`).
- TypeScript: **PASS** (`npm run typecheck`).
- Backend/demo regression: **2 PASS** — Golden Demo contract/traceability plus report import persistence/unverified status.
- Production build: recorded after the final CSS correction below; existing large-bundle advisory is non-blocking and documented if emitted.
- `git diff --check`: PASS before commit, subject to a final check.

## Genuine report UAT

**NOT VERIFIED.** The workspace search found no readable copy of:

1. `Game puzzle nào đang đứng đầu thị trường năm 2026`
2. `Nghiên cứu Tiles Hop — US iOS 2026`

To close the genuine-report gate, provide either exact report as a readable `.md`, `.txt` or `.json` file in the workspace/QA handoff area. Do not paste or seed synthetic content as a substitute. Any Tiles Hop structured payload should be validated against the current contract before import; the original research wording must remain intact.

## Limits and product acceptance

- Golden Demo is synthetic, clearly labeled, unverified and contains no quantitative values or real brands.
- CSV import is retained and collapsed for qualitative reports; this task does not implement or validate new analytics.
- Final mobile visual acceptance and genuine report UAT remain open.
- Existing frontend build emits the repository's large chunk advisory; no new bundler/chunk architecture was introduced.

**PO goal:** Read and work through a complete Research report without technical data-entry panels interrupting the qualitative flow.
**User journey:** Project → report overview → finding/evidence → entity/benchmark → report note → Project decision → Tracking → refresh/reopen.
**Automated work:** Keep report structure and source provenance visible, mark fixture URLs honestly, seed an idempotent QA walkthrough and preserve existing saved work.
**Expected result:** A full QA-only workflow that exercises findings, evidence, entities, comparison and the distinct report/project decision surfaces.
**Remaining friction:** A genuine owner report is not available; final 390px visual result needs a stable browser recapture.
**Verification:** 235 frontend tests, TypeScript, production build, two targeted backend tests and actual desktop browser walkthrough; final mobile correction and genuine report are not verified.
**Decision:** `TECHNICAL PASS for isolated Golden Demo / PRODUCT NEEDS FIX / OWNER ACCEPTANCE PENDING`.

**Implementation commit:** pending.

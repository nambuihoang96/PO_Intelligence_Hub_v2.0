# Final Research Visual & Workflow Recovery — Review Handoff

Date: 2026-10-29  
Branch: `feat/ux-recovery-01-research-results`  
Starting HEAD: `21721562f0ef6eebef8aba36506b33688204e68f`  
Status: `SCOPED G2-02 TECHNICAL PASS — BROADER RECOVERY NEEDS FIX / OWNER REVIEW PENDING`

## Scope and outcome

This round audits the nine requested Research screens and unifies the global Reports Library with the existing Project report-card experience. It does not change report persistence, IDs, project links, PO decisions, benchmark data, backend code, database schema, or SQLite files.

The existing Project Reports Library already uses the report-card visual treatment. The global `/reports` route previously remained an administrative row list. It now uses the same card language, report type labels, summary chips, search/filter toolbar, explicit project context, and empty states. Duplicate long Project Decision links were removed from global cards; project-specific Tracking is only surfaced when the current project and an explicitly linked saved decision are available.

## Visual and workflow audit

| Screen | Approved reference | Current real-app capture | Missing UI / behavior | Severity | Action / status |
|---|---|---|---|---|---|
| Research Home | `docs/design/approved/peachy/Pastel Vietnamese PO Intelligence Dashboard.png`; storyboard | [Research Home desktop](screenshots/final-research-visual-recovery/after/research-home-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/research-home-mobile-390x844.png) | Project list and recent reports are understandable; it is more workflow-led and less dashboard-dense than the reference. No fake market metrics are present. | P2 visual difference | Keep the current business-first project/recent-report entry; no scope expansion in this round. |
| Project Home | Peachy dashboard and `PO Hub Research Dashboard Flowchart.png` | [Project Home desktop](screenshots/final-research-visual-recovery/after/project-home-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/project-home-mobile-390x844.png) | Three actions and recent results are present. Supporting collections/subjects/activity remain more utilitarian than the reference and may require scrolling. | P1 visual hierarchy | Preserve three approved actions; no new module or fake summary added. |
| Deep Research | `PO Hub Research Dashboard Flowchart.png`, storyboard | [Deep Research desktop](screenshots/final-research-visual-recovery/after/deep-research-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/deep-research-mobile-390x844.png) | The flow is a form/prompt handoff rather than an editorial guided journey. Plan/Run details are still present in the existing workflow. | P1 workflow clarity | Retain existing workflow; broader plan UX remains outside this bounded library fix. |
| Reports Library | Peachy dashboard Reports navigation; existing Project Library reference capture | [Project library desktop](screenshots/final-research-visual-recovery/after/project-report-library-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/project-report-library-mobile-390x844.png); [prior global desktop](screenshots/final-research-visual-recovery/after/reports-global-desktop-1440x900.png), [prior global mobile](screenshots/final-research-visual-recovery/after/reports-global-mobile-390x844.png) | The global row layout was replaced by the same report-card family as the Project library. The first legacy QA server omitted report summary metadata; current-source QA was then started on ports 15317/15318 with a copied QA database. The new API returns summary fields and the real app displays 1 Structured, 2 Một phát hiện, and 2 Text-only reports. Post-change desktop/mobile screenshots are saved under `screenshots/final-research-visual-recovery/global-library-round-3/`. | P0 verification / runtime contract mismatch | UI consumes summary fields without N+1 detail requests. Current-source QA confirms the API/UI contract and the captured global route passes classification, search, filter, report-ID navigation, and mobile width checks. |
| Report Overview / Findings | `POHub_Findings_Peachy.png` | [Report desktop](screenshots/final-research-visual-recovery/after/report-overview-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/report-overview-mobile-390x844.png), [multiple findings](screenshots/final-research-visual-recovery/after/multiple-findings-desktop-1440x900.png) | Existing contextual reader/findings behavior is retained. Its shell and information density do not fully match the approved high-fidelity composition; no unsupported metrics were added. | P1 visual difference | Keep current evidence and notes behavior; G1 visual acceptance remains open. |
| Entity / Subject Profile | `POHub_Entity_Benchmark_Peachy.png` | [Entity desktop](screenshots/final-research-visual-recovery/after/entity-profile-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/entity-profile-mobile-390x844.png) | Profile uses domain-neutral saved subject data; sparse records cannot reproduce the mockup's richer visual profile. | Intentional data difference + P2 visual gap | Do not invent app identity, attributes, or metrics. |
| Benchmark | `POHub_Entity_Benchmark_Peachy.png` | [Benchmark desktop](screenshots/final-research-visual-recovery/after/benchmark-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/benchmark-mobile-390x844.png) | Sparse observations use Unknown states; no ranking/chart is implied. Existing matrix is more utilitarian than reference. | Intentional data difference + P1 visual gap | Preserve evidence, selection, PO notes and unknown values. |
| Tracking | Storyboard decision/tracking flow | [Tracking desktop](screenshots/final-research-visual-recovery/after/tracking-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/tracking-mobile-390x844.png) | Saved decisions can be reopened; snapshot history, longitudinal comparison and alerts are not implemented. | Missing business capability (out of scope) | Keep G4 lifecycle work unimplemented and accurately marked on the Recovery Board. |
| PO Decision | Storyboard decision flow; Findings reference | [Decision desktop](screenshots/final-research-visual-recovery/after/project-decision-desktop-1440x900.png), [mobile](screenshots/final-research-visual-recovery/after/project-decision-mobile-390x844.png) | Contextual decision persistence exists; complete action lifecycle/history is not available. | P1 capability gap | Do not add a second decision store; preserve existing persistence and G4 status. |

### Contact-sheet / screenshot index

The linked `after/` images above are real Chrome captures of the running isolated QA application and provide the audit baseline for routes unchanged in this round. The new global Reports captures in `screenshots/final-research-visual-recovery/global-library-round-3/` are from the current workspace frontend and backend using an isolated copy of the QA SQLite database. They show the post-change global screen at 1440×900 and 390×844; mobile document width is 390px.

## Before / after — Reports Library

- **Baseline:** `screenshots/final-research-visual-recovery/global-library-round-3/before-global-library-desktop-1440x900.png` and `before-global-library-mobile-390x844.png`, captured from the exact committed frontend at starting HEAD `21721562` against the same backend and isolated QA DB copy.
- **After:** `screenshots/final-research-visual-recovery/global-library-round-3/global-library-round-3-desktop-1440x900.png` and `global-library-round-3-mobile-390x844.png`, captured from the working frontend after the shared-card refactor.
- **Contact sheet:** `screenshots/final-research-visual-recovery/global-library-round-3/before-after.html`.
- **Observed change:** Before, the global page uses a large duplicate page heading, very loose search/filter spacing, unclassified flat rows, and repeats long project-decision links under each report. After, it uses the same report-card render path as Project Reports, adds report-type totals from API summary fields, keeps filters in one compact toolbar, places project context inline, and removes repeated long decision links. Mobile rows stay readable in one column and the document width is exactly 390px.
- **Remaining visual difference:** This remains a compact library list rather than the dashboard-like Reports navigation in Peachy references. That is intentional because this screen's job is to find/open saved reports; fake market summaries and metrics were not added.

## Root cause and implementation

| Finding | Evidence | Correction |
|---|---|---|
| Project library and global library used different visual patterns. | The global branch rendered `.report-history-list` rows while Project used `.report-library-card`. | Global Reports now uses the same report card family and shared toolbar/summary states. |
| Per-report project decision links made the global list noisy. | Each old row appended a long “Quyết định của dự án …” link. | Global cards show Project context inline and avoid repeating that decision link. |
| Global library did not expose report type/count summary. | It had only a flat result count. | Header adds total/type chips and card summaries based only on list-provided fields. |
| QA API list payload did not match the current summary contract. | Direct browser GET to `/api/v1/reports?limit=10` returned IDs, question, scope, hash, origin/import date and verification status, but omitted `parse_status`, `research_status`, `finding_count`, and `entity_count`. | No per-report detail fetch was added. The UI truthfully falls back to “Chưa phân loại” for a legacy API response; this mismatch was resolved for verification by starting current source on a new isolated QA backend, without stopping or replacing the old server. |

## Files changed

- `frontend/src/reports/ResearchIntake.tsx` — shared global report cards, summary chips and context.
- `frontend/src/reports/ReportLibrary.css` — shared Project/global library surface and mobile treatment.
- `frontend/src/reports/ResearchIntake.test.tsx` — global classification/context assertions and updated empty-state wording.
- `docs/RECOVERY_BOARD.md` — feedback round/status and next execution cursor.
- `.bangiao/FINAL-RESEARCH-VISUAL-WORKFLOW-RECOVERY.md` — this audit and handoff.

No backend, API source, schema, migration, original QA database or saved report was modified. A separate QA SQLite copy was created with the SQLite backup API and used for current-source verification; it is untracked QA data and excluded from the task commit. No user scratch was staged.

## Verification

- Frontend focused `ResearchIntake.test.tsx`: **50/50 PASS**.
- Frontend full suite: **26 files / 233 tests PASS**.
- TypeScript: **PASS**.
- Production build: **PASS**; existing Vite advisory remains for the ~633.57 kB minified JS chunk.
- Backend `tests/test_reports.py`: **32 passed, 1 deprecation warning**. The sandbox initially blocked temporary-folder creation and stalled socketpair setup; rerunning with Windows host permission and workspace-local test temp passed.
- Browser: **PASS on actual Chrome** at `http://127.0.0.1:15317/reports`, current-source backend `15318`, and an isolated copy of `.research-final-qa-demo-20261029/po_intelligence_hub.sqlite3`. The first legacy server at 15312 returned no summary fields; it was not terminated. On current source, 5 reports render as 1 Structured, 2 Một phát hiện, 2 Text-only. Search for `text-only` returns one card. Filters return all=5, Project A=3, Project B=2, unassigned=0. Each card URL preserves its original report ID; opening the first card retained `3dfd648e-67ac-4b9c-b864-7f5c0bd96d1c`. At 390×844, document width is 390px; at 1440px, document width 1425px equals viewport content width after scrollbar.
- Screenshot artifacts: current-source real Chrome captures: `screenshots/final-research-visual-recovery/global-library-round-3/global-library-round-3-desktop-1440x900.png`, `global-library-round-3-mobile-390x844.png`, and `global-library-round-3-mobile-report-card-390x844.png`. Earlier captures remain labeled as baseline for unchanged routes.
- Data integrity: read-only QA checks only; no report/project ID or SQLite data was changed.

## Product Acceptance

- **PO goal:** identify and reopen reports in a Project or across the workspace without scanning administrative rows.
- **User journey:** Reports → choose project scope → scan report type/context → open the same saved report; in a Project, import into that Project.
- **Automated work:** report cards and summary counts derive only from API summary fields; report IDs and existing Project links remain unchanged.
- **Expected result:** one consistent report library visual language, report type/context at a glance, search/filter and direct open.
- **Remaining friction:** The old QA backend remains stale on 15312; do not use it to verify current list metadata. The old process was preserved. Broader Peachy visual/product acceptance for G1 remains open; this round does not approve all nine screens.
- **Verification:** 233 frontend tests, focused 50 tests, TypeScript, production build and 32 backend report tests pass; actual browser filters/navigation and persisted desktop/mobile screenshots are verified.
- **Decision:** `TECHNICAL PASS / OWNER REVIEW PENDING` for this report-library feedback round. The broader Research Visual & Workflow recovery remains `NEEDS FIX / PRODUCT REVIEW PENDING`; this is not `PRODUCT PASS` or Owner Acceptance.

## Commits

- Starting HEAD: `21721562f0ef6eebef8aba36506b33688204e68f`.
- Implementation commit: `adc9e60` (`fix(reports): unify report library cards`).
- Evidence / Recovery Board commit: pending. Push verification: pending.

## Next action

Continue the existing Recovery Board cursor at G3-06 exact 1440×900 and 390×844 visual UAT. Keep G2-04 genuine-report verification pending until a genuine PO report is available. Do not mark broader G1/G2 tasks Product Accepted.




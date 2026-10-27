# PO Intelligence Hub — Recovery Board

**Mode:** B — Autonomous implementation with milestone reporting, explicitly authorized by the Product Owner on 2026-10-27.  
**Target:** 2026-10-31 (aggressive target; not a completion promise).  
**Current branch:** `feat/ux-recovery-01-research-results`  
**Planning source:** [Unified Product Recovery — October 2026](../.bangiao/UNIFIED-PRODUCT-RECOVERY-OCT-2026.md)  
**Audit baseline:** [Product Recovery Audit](../.bangiao/PRODUCT-RECOVERY-AUDIT.md)  
**Authority:** This board is the single status/backlog source for G1–G4. Detailed product decisions stay in the linked approved plan and historical handoffs. Do not create a competing roadmap.

## Operating rules

- Complete one bounded vertical slice, test it, request an independent review context where available, fix findings, rerun checks, then advance to the next approved unblocked slice.
- Preserve the current dirty worktree and production SQLite. Task commits must stage only files for that slice; exclude launcher/setup changes and scratch folders unless they become an explicitly approved task.
- Push completed reviewable commits under the owner's standing authorization; never merge master or release automatically. Milestone reports do not imply Owner Acceptance.
- Report exact tests, browser actions, screenshots and reviewers. Use `NOT VERIFIED` when evidence is missing.
- Re-read this board and its owner-feedback history before every task selection. New PO feedback overrides earlier assumptions, including on scoped-done work; rework the original task instead of duplicating it.
- Natural-language feedback from the PO in the active Codex session starts a change request directly; a separate generated task prompt is not required. Resolve affected tasks against this board and ask only if scope cannot be determined safely.
- Record each material revision under the existing task with round/date, original feedback, classification, affected/dependent tasks, impact, updated acceptance, implementation reference, review/test evidence and status. Preserve previous rounds when direction changes. Preserve both local and remote board edits during sync; never resolve conflicts by replacing one version wholesale.
- Use `READY_FOR_OWNER → REWORK → IN_PROGRESS → DEV_DONE → READY_FOR_OWNER` for review iterations. No arbitrary iteration cap; silence is not acceptance. `DONE (scoped)` is technical evidence only and never means owner acceptance.
- For major visual rework, show a small working prototype and real browser screenshots early. Pause only dependent work when direction changes; continue independent approved work safely.
- After a revision, run relevant verification, update this board, present the result, and continue independent approved work. Stop at explicit owner-approval gates or genuine blockers; do not infer acceptance from silence.

## Status legend

`READY_FOR_OWNER`, `REWORK`, `IN_PROGRESS`, `DEV_DONE` describe review iterations. `DONE (scoped)` = verified only to recorded evidence; owner acceptance remains separate. `READY` = next unblocked task; `BLOCKED` = requires external/business input; `NOT STARTED` = approved backlog; `DEFERRED` = intentionally outside current recovery. `PAUSED_FOR_UX_REVIEW` = dependent UI rollout is paused pending Product Owner review of the Project Home direction.

## Unified backlog and dependencies

| ID | Gate / priority | Task and outcome | Dependencies | Status | Latest evidence / defects |
|---|---|---|---|---|---|
| G1-01 | G1 / P0 | Product shell and three-area navigation: Research, Reports, Tracking | Existing implementation | REWORK / PRODUCT NEEDS FIX | Owner rejected the Project journey as exposing internal structure and competing actions. Preserve the three areas, but review how Project Home connects them before further rollout. |
| G1-02 | G1 / P0 | Editorial Research Report Reader, findings/evidence/unknowns, responsive UX and screenshot review | G1-01 | REWORK / PRODUCT NEEDS FIX | Owner's rejected Project workflow affects report entry/context and next-step clarity. Existing report-reader work remains; do not propagate another navigation model until Project Home direction is reviewed. |
| G1-03 | G1 / P1 | Peachy Studio design tokens, reusable screen primitives and cross-screen visual consistency | G1-02 data contracts stable | PAUSED_FOR_UX_REVIEW | Existing isolated design prototype at `frontend/prototypes/g1-03/` remains available. No shared rollout while the Project Home prototype is reviewed. |
| G2-01 | G2 / P0 | One-paste `po_research_v1` import; original report retained; structured/text-only states | Existing | REWORK / PRODUCT NEEDS FIX | Workflow rework must keep the one-paste report import, original report and structured/text-only behavior intact within Project context. |
| G2-02 | G2 / P0 | Project/Report shared identity, explicit legacy linking, project filter and context navigation | G2-01 | REWORK / PRODUCT NEEDS FIX | Preserve IDs, explicit links and current persistence; redesign the entry journey so Projects, saved reports and next actions feel connected without duplicate destinations. |
| G2-03 | G2 / P0 | Contextual PO Decision reachable from report finding/subject/project; one authoritative decision with safe legacy handling | G2-02, stable subject/finding target | PAUSED_FOR_UX_REVIEW | Existing persistence and legacy safety remain valid. Pause UI expansion until the Project Home and contextual decision path are reviewed. |
| G2-04 | G2 / P0 | Complete genuine long-form ChatGPT report → results → evidence → decision → refresh/reopen UAT | G2-02/03, owner report | PAUSED_FOR_UX_REVIEW | Do not accept the current end-to-end UI as product-ready while the Project journey is rejected. Genuine report/browser verification remains a separate acceptance need. |
| G3-01 | G3 / P0 | Preserve/reuse CSV import, readiness, chart and compatible period comparison in Project/Report workflow | Existing; G2-02 | PAUSED_FOR_UX_REVIEW (UI entry points only) | Existing backend/data functionality remains. Pause changes to Project-facing UI entry points until Project Home review; independent data-integrity fixes may continue. Owner Sensor Tower export lacks explicit GEO/date semantics; comparisons correctly withheld. |
| G3-02 | G3 / P0 | Persistent reusable Research Subject identity with explicit ambiguous mapping | G2-02 | DONE (scoped) | Commit `9f92a24`; additive `20261027_0010` subject/reference schema; explicit project-scoped links from report and CSV source keys; no auto-merge/backfill. 21 targeted backend tests, 170 frontend tests, typecheck/build pass; isolated Chrome UAT verified link + refresh. Full backend suite NOT VERIFIED (collection stall). Handoff `.bangiao/G3-02-RESEARCH-SUBJECTS.md`. Owner acceptance pending. |
| G3-03 | G3 / P0 | Project Benchmark Collections across report, CSV and explicitly linked trend observations | G3-02 | READY_FOR_OWNER | Original commit `e1728be`; trend-source extension commit `867f321`; additive collection migration `20261027_0011`. Reopened for bounded G3-04 source integration; trend claims display as exact text with source note/date/unverified provenance, without metric inference. Integration browser UAT NOT VERIFIED. Historical collection workflow UAT/screenshots and limitations remain in `.bangiao/G3-03-BENCHMARK-COLLECTIONS.md`. |
| G3-04 | G3 / P0 | Append-only Trend Update capture with source note, publication date, exact claim, confirmed subject and optional collection | G3-02/03 | READY_FOR_OWNER | Commit `867f321`; additive migration `20261027_0012`; project-scoped create/list API; Research form and collection source-backed display. 26 focused backend and 174 frontend tests pass; TypeScript/build pass. Genuine Rotate Rings input and post-change browser UAT NOT VERIFIED. Handoff `.bangiao/G3-04-TREND-UPDATES.md`. |
| G3-05 | G3 / P0 | Local Image Evidence upload/attachment, hash, source context and reopen | G3-04 | READY_FOR_OWNER | Commit `100c994`; additive SQLite BLOB table `20261027_0013`; 31 targeted backend tests, 176 frontend tests, TypeScript/build PASS. Browser UAT and genuine owner image NOT VERIFIED. Handoff `.bangiao/G3-05-IMAGE-EVIDENCE.md`. |
| G3-06 | G3 / P0 | Subject Profile and extensible analysis sections; Core Loop / Level Design / Ad Placement starter blocks | G3-02 | READY_FOR_OWNER | Commit `bd69a72`; additive optional PO-authored analysis sections, extensible labels, existing subject identity/provenance and contextual links retained. Migration `20261027_0014`. 33 focused backend tests, 177 frontend tests, TypeScript and production build PASS. Browser UAT NOT VERIFIED. Handoff `.bangiao/G3-06-SUBJECT-PROFILES.md`. |
| G3-07 | G3 / P0 | Monthly Benchmark Tracking for explicit collection snapshots/updates, with unknown/incompatible states | G3-03/04, G4 | NOT STARTED | Do not infer growth from a headline/ranking or incompatible measurements. |
| G4-01 | G4 / P0 | Research input/report/dataset/decision history and snapshots with evidence-backed comparison | G2-02, G2-03, G3-04/05 | BLOCKED | Tracking is currently a truthful setup-pending placeholder; no longitudinal timeline/comparison. The approved Master Plan also requires P0-D (contextual decision continuity) before P0-G; see dependency reconciliation below. |
| G4-02 | G4 / P0 | PO Action Tracking, status history and contextual reopen | G2-03, G4-01 | NOT STARTED | Existing next-action text/decision is not a managed tracking lifecycle. Reuse existing persistence where possible; no auto-completion. |
| G4-03 | G4 / P0 | Cross-milestone end-to-end owner acceptance, backup/restore and regression gate | G1–G4 slices | NOT STARTED | Requires genuine owner report/trend source and isolated database copy; no production data writes. |
| REL-01 | Cross-cutting / P1 | Review 86-commit / 158-path branch delta; full regression and isolated migration/restore | Before release | NOT STARTED | Broad shared CSS/navigation/models/migrations. Do not merge master without explicit approval. |
| AUTO-01 | Cross-cutting / P2 | Crawler, automatic monitoring, AI/paid APIs | Separate approval | DEFERRED | Not in approved scope; requires source rights and explicit product decision. |

## Milestones

| Milestone | Current readiness | Exit conditions | Report |
|---|---|---|---|
| **G1 — UI/UX Recovery** | PARTIAL / PRODUCT NEEDS FIX | Peachy design direction applied across shell/reader; responsive screenshots from running app; report readability and accessibility verified. | `.bangiao/milestones/G1-REVIEW.md` — pending |
| **G2 — Research Workflow** | PARTIAL | Project/report identity; one-paste import; results/evidence; contextual PO decision; genuine end-to-end refresh/reopen. | `.bangiao/milestones/G2-REVIEW.md` — pending |
| **G3 — Product Intelligence** | PARTIAL | Reusable subjects/collections; trend/source/image evidence; analyses; compatible CSV integration; Rotate Rings case using genuine source artifact. | `.bangiao/milestones/G3-REVIEW.md` — pending |
| **G4 — History & Tracking** | NOT STARTED | Saved inputs/snapshots, evidence-backed changes, PO action history and longitudinal workflow; unknowns preserved. | `.bangiao/milestones/G4-REVIEW.md` — pending |

## Latest verification ledger

These are historical recorded results, not a fresh full-suite run against every dirty file:

- Frontend latest audit: **167 tests PASS**, TypeScript PASS, production build PASS (existing bundle-size advisory).
- Backend latest audit: **15 workspace tests PASS**; full backend and report-focused suites **NOT VERIFIED** after environment hangs.
- SQLite QA copy: integrity `ok`, revision `20261024_0009`; production SQLite was not written.
- Browser: screenshots in `.bangiao/screenshots/product-recovery-audit/` captured from the running localhost app using an isolated SQLite copy. The rendered current audit views do not prove all interactions or genuine-data acceptance.
- G3-02 subject identity: 21 targeted backend tests PASS; 170 frontend tests PASS; TypeScript and production build PASS; isolated Chrome/SQLite explicit report + CSV subject mapping survived refresh. Screenshot: `.bangiao/screenshots/g3-02-subject-identity/subject-report-csv-links-after-refresh.png`. Full backend suite collection NOT VERIFIED in this Windows environment.
- G3-03 benchmark collections: original commit `e1728be`; follow-up trend integration delivered with G3-04. Original 23 focused backend/171 frontend tests and isolated collection Chrome UAT are recorded in `.bangiao/G3-03-BENCHMARK-COLLECTIONS.md`. Trend integration has 26 focused backend/173 frontend tests plus TypeScript/build PASS; its browser UAT NOT VERIFIED. Broad `DatabaseMigrationTest` and mobile UAT remain NOT VERIFIED. No genuine owner trend input was available.
- G3-04 trend updates: commit `867f321`; additive migration `20261027_0012`; append-only project create/list API; requires saved subject and membership if collection selected; exact claim/note/date retained; URL is displayed only and never fetched; status is always source-reported/unverified; trend claim appears as text in the selected collection matrix. 26 backend focused tests PASS (`test_trend_updates`, `test_benchmark_collections`, `test_subjects`, `test_workspace_data_first`); 174 frontend tests PASS; TypeScript and build PASS (530.24 kB chunk advisory); `git diff --check` PASS for implementation. Browser UAT NOT VERIFIED because isolated local QA ports could not be reliably bound/reached; genuine Rotate Rings source input absent. Handoff `.bangiao/G3-04-TREND-UPDATES.md`.
- G2-02 current candidate: 38 focused frontend tests PASS; 15 backend workspace tests PASS; TypeScript and production build PASS; isolated SQLite/Chrome UAT PASS at 1440×900. Screenshot evidence: `.bangiao/screenshots/p0-project-report-unification/`. Independent read-only review: no P0/P1 finding; browser-history back behavior remains untested.
- G3-06 subject profiles: 33 focused backend tests PASS (`test_subjects`, `test_image_evidence`, `test_trend_updates`, `test_benchmark_collections`, `test_workspace_data_first`); 177 frontend tests PASS; TypeScript and production build PASS (543.75 kB JS chunk advisory). Migration `20261027_0014` was tested by downgrading/upgrading an isolated temporary SQLite database with a legacy subject; analysis sections reopened as empty and existing subject data remained. Browser UAT NOT VERIFIED. Handoff `.bangiao/G3-06-SUBJECT-PROFILES.md`.

## Defects / external inputs

1. Report-level PO notes and Project decisions are separate; current UX can route to legacy notes instead of authoritative decision.
2. Project collections now support explicit report/CSV subject observations; trend update records are not yet a source type and are pending G3-04 integration.
3. Append-only Trend Update capture now exists, but image evidence management and useful Tracking history do not. Genuine trend-source validation remains blocked on owner-supplied material.
4. Sensor Tower export is missing explicit GEO and date semantics; do not fill them by inference.
5. Actual Rotate Rings source note/link/image is not in current evidence; user input required for genuine source verification/UAT.
6. Full backend regression and production-history backup/restore are NOT VERIFIED.
7. Feature branch has 86 commits/158 paths relative to master; integration review is a release blocker, not permission to merge.

## Product Owner feedback history

### MODE-B-R1 — 2026-10-27 — Continuous Product Owner feedback

- **Original feedback:** “Upgrade the existing autonomous Mode B workflow to support continuous Product Owner feedback, repeated design iterations and dynamic backlog changes. Do not restart the project, recreate the Recovery Board or interrupt unrelated approved work unnecessarily.”
- **Classification:** Workflow change to the recovery operating model; no product architecture direction changed.
- **Impact:** Applies to every open or previously scoped-done task. Re-read this board before task selection; reopen the original task when owner feedback affects it; preserve dependencies, valid behavior and local/remote board edits. G3-03 continued as a bounded slice, then was reopened for its planned trend-source matrix extension once G3-04 created the source contract.
- **Updated acceptance:** Use `READY_FOR_OWNER → REWORK → IN_PROGRESS → DEV_DONE → READY_FOR_OWNER`; allow unbounded owner review rounds; keep feedback/change/impact/criteria/implementation/evidence linked under the original task; silence never means acceptance; major UI rework starts with a real working preview and screenshots.
- **Implementation reference:** This entry and the Mode B rules in repository `AGENTS.md`.
- **Verification:** Process/documentation change reviewed in the active session. No automated tests apply. Existing board and G3-03 working changes were preserved.
- **Current status:** Applied; used to re-read/sync the board before each selection, preserve existing dirty work, reopen G3-03 under the same task after the source dependency arrived, and update G3-04/next cursor. No owner acceptance implied for any product task.

## Backlog dependency reconciliation

### G4-01 prerequisite alignment — 2026-10-27

- **Finding:** The board row previously listed G4-01 dependencies as G2-02 and G3-04/05, while the approved Master Plan §4 identifies P0-G History & Tracking dependencies as P0-C/D/F. P0-D is represented by G2-03, which is still unimplemented; the plan also defines decision revisions as timeline events.
- **Classification:** Dependency correction; no product scope added.
- **Impact:** G4-01 cannot safely establish a PO decision history/timeline before G2-03 provides a stable contextual decision target and revision semantics. G3-07 remains gated on G4. G2-03 itself depends on completed G2-02 and is now the next unblocked P0 task.
- **Updated acceptance:** G4-01 remains blocked until G2-03 is complete and report/update/dataset provenance dependencies are reconfirmed. Preserve saved decisions and legacy report notes; no inferred migration.
- **Verification:** Compared current board rows against `.bangiao/UNIFIED-PRODUCT-RECOVERY-OCT-2026.md` §4 items P0-D/P0-G and §3 source-of-truth rule 7. No code or database changes.
- **Current status:** Applied to this board; G2-03 is READY, G4-01 is BLOCKED, and G3-07 remains NOT STARTED.

### G2-03 task selection and impact — 2026-10-27

- **Selection basis:** G2-03 is the highest-priority unblocked recovery slice after re-reading this board. G2-02 is complete; current code already has PO decision validation, optimistic revisions and evidence resolution that can be reused.
- **Directly affected components:** `backend/app/opportunities.py`, `backend/app/schemas.py`, `POOpportunityDecision` persistence only if stable target identity requires an additive field, `frontend/src/research/OpportunityReview.tsx`, contextual entry points in Research Results / Subject / Trend Update, and their existing tests.
- **Dependent tasks:** G4-01 decision revision timeline and G4-02 PO action lifecycle. Keep both blocked on stable contextual decision targets.
- **Data implications:** Preserve every existing `candidate_id`, decision JSON and report-local legacy note. Do not auto-map historical candidate decisions or rewrite immutable source records.
- **Regression risks:** Existing CSV shortlist filtering, evidence reference integrity, revision conflicts, refresh/reopen drafts and legacy report notes.
- **Updated acceptance:** A PO can open the existing decision workspace from an explicit finding, subject or update; save and reopen one authoritative project decision with separate source recommendation, assessment, notes, next action, status and evidence; old records remain accessible without guessed remapping.
- **Current status:** G2-03 entered `IN_PROGRESS`; code audit found no need to change the approved overall architecture. Browser proof remains to be evaluated after implementation.

### G2-03 implementation pass — 2026-10-27

- **Feedback round:** First implementation pass against the approved G2-03 criteria; no new owner rejection or changed product assumption was received in this round.
- **Root cause confirmed:** Project PO decisions were keyed to selected CSV candidates. Findings, entities, subjects, collections and trend updates had no independent project decision identity; report-local notes were a separate legacy store.
- **Changes requested/acceptance:** Preserve old CSV decision keys; provide explicit contextual decision targets; keep report/CSV evidence provenance; retain revision history and report-local notes; never guess a subject relationship.
- **Impact:** `opportunities.py` and decision request schema, the existing decision workspace and contextual entry points from Results, project, subject, collection and trend-update views. No database model, migration, report content, or SQLite data changes.
- **Implementation reference:** The existing `POOpportunityDecision` row now stores an optional explicit target in its decision JSON. The target is revalidated against the same project and report content hash at save time. Previous decision versions are kept as snapshots; stale report targets are rejected without modifying the saved decision. Existing CSV candidate IDs remain unchanged.
- **Automated evidence:** 37 focused backend tests PASS; 179 frontend tests PASS; frontend TypeScript check and production build PASS. `git diff --check` PASS. Browser UAT NOT VERIFIED; no claim of product acceptance.
- **UAT tooling check:** A disposable HTTP-route test was attempted and stopped before any request: Starlette TestClient/AnyIO blocked while creating the Windows `socket.socketpair` during context startup. No API assertion ran; the temporary test was removed. No Playwright/Selenium runtime or browser driver was found in the configured local environment. This is an environment limitation, not evidence that the API route passes or fails.
- **Current status:** `READY_FOR_OWNER` for review, with browser interaction verification still pending. No owner acceptance is implied.

## Current execution cursor

**Active task:** Project Home UX rework is in `IN_PROGRESS` for the approved, bounded application implementation. The Product Owner replied “ok” to the Project Home prototype direction. G1-01/G1-02/G2-01/G2-02 remain reopened as `REWORK / PRODUCT NEEDS FIX`; this implementation connects only the Project Home, contextual Deep Research brief, in-flow Trend Update subject creation, and project-scoped report intake. It does not propagate a new layout across other report or tracking screens. G1-03 visual rollout, G2-03/G2-04, and Project-facing G3-01 expansion remain paused where dependent on broader UX review. Independent backend/data-integrity work may continue. Final product acceptance is pending.

**Next selection:** Product Owner reviews the integrated Project Home workflow on the local application. Do not merge or expand this layout to other application areas before owner review. G2-04 still requires a genuine owner report and isolated browser UAT; the UAT fixture below is not genuine research. Re-read dependencies and this feedback history after owner input. G4-01 remains gated by contextual decision acceptance and the approved Master Plan's P0-D prerequisite; G3-07 remains gated on G4.

### G1-03 task selection — 2026-10-27

- **Selection basis:** G1-03 is the next approved P1 slice independent of G2-03. P0-A (shared Project/Report context) is complete as G2-02; G1-02's research data contract remains stable even though report-reader product review still has open UX findings.
- **Classification:** Bounded visual prototype; no architecture or product workflow change.
- **Direct impact:** New isolated prototype artifact only. Existing Research Results, navigation, saved reports, PO notes, benchmark selections and shared CSS are not changed during the owner-preview phase.
- **Dependent tasks:** Cross-screen token rollout remains blocked on PO preview approval. G1-02 visual rework remains tracked on G1-02 and is not duplicated here.
- **Updated acceptance:** Show Peachy Studio semantic token candidates and reusable Results primitives in a real browser preview; check text contrast and responsive layout; capture actual browser evidence. Stop for PO direction before applying styles to production screens.
- **Current status:** `BLOCKED` — the static prototype is ready, but Codex Browser Use timed out connecting to the local Vite preview and rejected the `file://` URL under its security policy. No alternate browser/control route was attempted; real browser screenshot and visual UAT remain `NOT VERIFIED`.

### Project Home UX rejection — feedback round 1 — 2026-10-27

- **Original owner feedback:** “The Product Owner has reviewed the actual running application and rejected the current Project workflow. This is a PRODUCT UX FAILURE, not a minor visual polish issue.” The owner identified the technical Research Plan landing, competing actions, disconnected Project/Workspace/Reports, unclear next step, Trend Update without a create-subject journey, and mismatch with the approved Peachy Studio direction.
- **Classification:** Workflow change and UI/UX rework; no backend architecture change approved.
- **Affected tasks:** G1-01, G1-02, G1-03, G2-01, G2-02, G2-03 and G2-04; Project-facing UI entry points in G3-01. Dependent UI expansion is paused. Independent backend and data-integrity work may continue when safe.
- **Impact analysis:** Existing project/report identity, report import, report detail, benchmark collections, research subjects, trend update and PO-decision persistence can be reused. Main defect is the frontend journey: project creation routes to technical plan editing; research workspace exposes several internal destinations/actions; trend capture requires a pre-existing subject. Production database/schema changes are not indicated for the prototype.
- **Updated acceptance:** One Project Home presents Deep Research, Trend Update and CSV as primary actions, and keeps reports, benchmark collections, subjects, recent activity and next steps in the same project context. Plan and subject selection/creation are contextual. Reopening a report retains its project context. First deliver a working isolated prototype with five owner-review scenarios; do not roll the design across the application before owner review.
- **Implementation reference:** `frontend/prototypes/project-home/`; handoff `.bangiao/PROJECT-HOME-UX-PROTOTYPE.md`; preview `http://127.0.0.1:15190/prototypes/project-home/`.
- **Verification evidence:** Actual Codex in-app browser interaction covered new-project empty state, existing Puzzle project with a saved report, contextual Deep Research prompt flow, Trend Update for a newly created subject, and reopening/returning from the existing report. Mobile project/report screens were visually checked at 390px. Prototype state is explicitly demo-only and isolated per project; no application API or SQLite was written. Browser screenshots were captured inline in the Codex session; export to repository files was unavailable in the active browser surface.
- **Current status:** `IN_PROGRESS` — prototype ready for early Product Owner review. Product acceptance is pending; no full UI rollout, merge or roadmap task transition.

### G1-03 feedback round 1 — 2026-10-27 — Unblock Codex browser preview

- **Original owner feedback:** “Tự tháo gỡ cái blocker đấy đi chứ?”
- **Classification:** Verification workflow unblock with bounded responsive UX correction.
- **Impact analysis:** G1-03 only. Browser verification was blocked because the preview server could not be reached from the in-app browser. Starting the existing Vite preview with the required local socket permission resolved reachability. A real 1024px view additionally showed cramped two-column findings beside the secondary rail; the rail now moves below Findings at widths up to 1120px. No backend, database, report, benchmark, PO note, or unrelated task changes.
- **Updated acceptance:** Verify the actual Codex browser preview at desktop/tablet/mobile sizes, check findings readability and horizontal overflow, and exercise keyboard summary disclosure. Keep image evidence honest; browser captures were seen inline but not exported as repository files.
- **Implementation reference:** `frontend/prototypes/g1-03/tokens.css`; handoff `.bangiao/G1-03-DESIGN-PROTOTYPE.md`; preview `http://127.0.0.1:15190/prototypes/g1-03/`.
- **Verification evidence:** HTTP 200. Viewports checked: 1440×900, 1024×828, 768×900, 390×844. At 1024px, after the responsive correction, Findings width 724px and card widths 338px; no horizontal page overflow observed at any checked width. “Read full summary” expanded with Enter. Frontend tests 21 files / 179 tests, TypeScript/Vite build, and CSS parse passed. No persistent product-data flow is part of this isolated prototype.
- **Current status:** `READY_FOR_OWNER` for visual review; no owner acceptance or shared styling rollout implied.

### G1-03 prototype pass — 2026-10-27 (history before feedback round 1)

- **Feedback round:** Initial prototype pass; no new PO visual direction or acceptance received.
- **Classification:** Bounded UI/UX prototype, not a workflow or architecture change.
- **Changes requested:** Show semantic Peachy Studio tokens and reusable report primitives before applying a shared style rollout.
- **Impact:** New isolated HTML/CSS preview and handoff only. No app component, shared CSS, database, report, PO note, benchmark or navigation behavior changed.
- **Implementation reference:** `frontend/prototypes/g1-03/index.html` and `tokens.css`; placeholder labels are explicitly marked as non-report data.
- **Verification:** Frontend TypeScript/production build PASS (546.55 kB JS chunk advisory); after the restricted attempt failed with temp-cache `EPERM`, the full Vitest suite passed with normal temp-cache access: 21 files / 179 tests. Key foreground/background text pairs checked at ≥4.65:1. Browser preview NOT VERIFIED; localhost timed out and `file://` was refused by browser security policy. No screenshot captured.
- **Current status:** `BLOCKED` pending in-Codex browser rendering or owner review of the standalone prototype. No application styles are rolled out; no Owner Acceptance implied.

### Project Home implementation pass — 2026-10-27

- **Owner response:** “ok” to the working Project Home prototype; interpreted as approval to proceed with this bounded app integration, not as final product acceptance.
- **Classification:** Workflow rework within the reopened G1/G2 scope. No database, migration, API contract, or backend architecture change.
- **Changes:** Project detail now opens Project Home; the three business actions open contextual flows; a new-project submit lands on that home; Trend Update can create a product/topic inline; saved research briefs continue to one-paste report intake with the same project context; project reports, collections, subjects, and recent activity are visible together.
- **Root cause / fix:** The old project route always selected the plan editor and the data workspace exposed internal sections before the PO chose a task. Route selection now uses explicit `view=plan` / `view=data`, defaulting to Project Home. Empty scope parameters from a new plan now correctly use `Global / not specified` and `Unknown` defaults.
- **Verification:** Frontend 21 files / 185 tests PASS; TypeScript PASS; Vite production build PASS (existing >500 kB chunk advisory). Actual in-app browser on isolated QA backend/database `15191`/`15192`: create project, open blank Project Home, open/save Deep Research brief, continue to report intake, verify default scope, import explicitly labeled UAT text, open report, filter the project Reports Library, return to Project Home, create a new topic in Trend Update, save, refresh, and confirm topic/update/report/activity persist. Production app browser capture was visually inspected at the available browser viewport; exact 1440/1024/768/390 application viewport verification and screenshot file export are NOT VERIFIED. No genuine research report was used; the only created report/update are explicitly labeled UAT fixtures.
- **Data safety:** App backend used isolated `.ux-project-home-uat-data`; no production SQLite database was touched. No migration or schema change.
- **Remaining:** Project Home final visual/product review; responsive screenshot files; genuine owner report UAT remains open under G2-04. Existing project category/owner fields remain optional at project creation. Do not call this product accepted.
- **Implementation reference:** `frontend/src/research/ProjectHome.tsx`, `frontend/src/research/ProjectHome.css`, related React routing/workflow changes, tests, and `.bangiao/PROJECT-HOME-UX-PROTOTYPE.md`.
- **Current status:** `READY_FOR_OWNER` for this bounded workflow review; final product acceptance and merge are pending.

**Last updated:** 2026-10-27 — Project Home prototype direction approved for bounded app implementation; integrated flow is `READY_FOR_OWNER`. G1/G2 rework remains open; no milestone is Owner Accepted.

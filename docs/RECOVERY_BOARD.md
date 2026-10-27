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
- Record each material revision with original feedback, classification, impact/dependencies, updated acceptance, implementation and evidence. Preserve both local and remote board edits during sync; never resolve conflicts by replacing one version wholesale.
- Use `READY_FOR_OWNER → REWORK → IN_PROGRESS → DEV_DONE → READY_FOR_OWNER` for review iterations. No arbitrary iteration cap; silence is not acceptance. `DONE (scoped)` is technical evidence only and never means owner acceptance.
- For major visual rework, show a small working prototype and real browser screenshots early. Pause only dependent work when direction changes; continue independent approved work safely.

## Status legend

`READY_FOR_OWNER`, `REWORK`, `IN_PROGRESS`, `DEV_DONE` describe review iterations. `DONE (scoped)` = verified only to recorded evidence; owner acceptance remains separate. `READY` = next unblocked task; `BLOCKED` = requires external/business input; `NOT STARTED` = approved backlog; `DEFERRED` = intentionally outside current recovery.

## Unified backlog and dependencies

| ID | Gate / priority | Task and outcome | Dependencies | Status | Latest evidence / defects |
|---|---|---|---|---|---|
| G1-01 | G1 / P0 | Product shell and three-area navigation: Research, Reports, Tracking | Existing implementation | DONE (scoped) | UX-IA-01 and M6-B R1 handoffs; focused navigation tests pass. Full current branch integration still unverified. |
| G1-02 | G1 / P0 | Editorial Research Report Reader, findings/evidence/unknowns, responsive UX and screenshot review | G1-01 | DONE (partial; product NEEDS FIX) | UI-01/UI-RECOVERY handoffs and real screenshot sets exist. Latest audit finds text/readiness density and mobile tab/matrix affordance issues. |
| G1-03 | G1 / P1 | Peachy Studio design tokens, reusable screen primitives and cross-screen visual consistency | G1-02 data contracts stable | READY after P0-A | Skill exists and was searched; proposal is in unified plan. Tokens have not been screenshot-approved or fully contrast-audited. |
| G2-01 | G2 / P0 | One-paste `po_research_v1` import; original report retained; structured/text-only states | Existing | DONE (scoped) | B-001.3 and related handoffs; live genuine report journey remains NOT VERIFIED in latest release audit. |
| G2-02 | G2 / P0 | Project/Report shared identity, explicit legacy linking, project filter and context navigation | G2-01 | DONE (scoped) | Focused backend/frontend tests pass; isolated Chrome/Playwright UAT linked a report, verified project filter, same report ID, reload/back link and preservation of report/benchmark data. Screenshots committed in `.bangiao/screenshots/p0-project-report-unification/`. Independent review found no P0/P1 defect. Owner acceptance pending. |
| G2-03 | G2 / P0 | Contextual PO Decision reachable from report finding/subject/project; one authoritative decision with safe legacy handling | G2-02, stable subject/finding target | NOT STARTED | Audit defect REC-P1-02; report notes JSON and Project `POOpportunityDecision` are separate. Keep old notes, no silent migration. |
| G2-04 | G2 / P0 | Complete genuine long-form ChatGPT report → results → evidence → decision → refresh/reopen UAT | G2-02/03, owner report | BLOCKED for genuine-data pass | Existing reports were viewed; no new genuine owner-provided structured report was imported in latest audit. Continue fixture/browser tests but do not claim product PASS. |
| G3-01 | G3 / P0 | Preserve/reuse CSV import, readiness, chart and compatible period comparison in Project/Report workflow | Existing; G2-02 | DONE (implementation scoped; owner data acceptance blocked) | UI-02/M1–M6 handoffs and browser evidence. Owner Sensor Tower export lacks explicit GEO/date semantics; comparisons correctly withheld. |
| G3-02 | G3 / P0 | Persistent reusable Research Subject identity with explicit ambiguous mapping | G2-02 | DONE (scoped) | Commit `9f92a24`; additive `20261027_0010` subject/reference schema; explicit project-scoped links from report and CSV source keys; no auto-merge/backfill. 21 targeted backend tests, 170 frontend tests, typecheck/build pass; isolated Chrome UAT verified link + refresh. Full backend suite NOT VERIFIED (collection stall). Handoff `.bangiao/G3-02-RESEARCH-SUBJECTS.md`. Owner acceptance pending. |
| G3-03 | G3 / P0 | Project Benchmark Collections across report, CSV and explicitly linked trend observations | G3-02 | READY_FOR_OWNER | Original commit `e1728be`; trend-source extension commit `867f321`; additive collection migration `20261027_0011`. Reopened for bounded G3-04 source integration; trend claims display as exact text with source note/date/unverified provenance, without metric inference. Integration browser UAT NOT VERIFIED. Historical collection workflow UAT/screenshots and limitations remain in `.bangiao/G3-03-BENCHMARK-COLLECTIONS.md`. |
| G3-04 | G3 / P0 | Append-only Trend Update capture with source note, publication date, exact claim, confirmed subject and optional collection | G3-02/03 | READY_FOR_OWNER | Commit `867f321`; additive migration `20261027_0012`; project-scoped create/list API; Research form and collection source-backed display. 26 focused backend and 174 frontend tests pass; TypeScript/build pass. Genuine Rotate Rings input and post-change browser UAT NOT VERIFIED. Handoff `.bangiao/G3-04-TREND-UPDATES.md`. |
| G3-05 | G3 / P0 | Local Image Evidence upload/attachment, hash, source context and reopen | G3-04 | READY_FOR_OWNER | Commit `100c994`; additive SQLite BLOB table `20261027_0013`; 31 targeted backend tests, 176 frontend tests, TypeScript/build PASS. Browser UAT and genuine owner image NOT VERIFIED. Handoff `.bangiao/G3-05-IMAGE-EVIDENCE.md`. |
| G3-06 | G3 / P0 | Subject Profile and extensible analysis sections; Core Loop / Level Design / Ad Placement starter blocks | G3-02 | READY_FOR_OWNER | Commit `bd69a72`; additive optional PO-authored analysis sections, extensible labels, existing subject identity/provenance and contextual links retained. Migration `20261027_0014`. 33 focused backend tests, 177 frontend tests, TypeScript and production build PASS. Browser UAT NOT VERIFIED. Handoff `.bangiao/G3-06-SUBJECT-PROFILES.md`. |
| G3-07 | G3 / P0 | Monthly Benchmark Tracking for explicit collection snapshots/updates, with unknown/incompatible states | G3-03/04, G4 | NOT STARTED | Do not infer growth from a headline/ranking or incompatible measurements. |
| G4-01 | G4 / P0 | Research input/report/dataset/decision history and snapshots with evidence-backed comparison | G2-02, G3-04/05 | NOT STARTED | Tracking is currently a truthful setup-pending placeholder; no longitudinal timeline/comparison. |
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

## Current execution cursor

**Active task:** G3-06 / P0 Subject Profile and extensible analysis sections. Implementation and automated verification are complete and ready for owner review; browser UAT is not verified. G3-05 is independently ready for owner review; neither status implies owner acceptance.

**Next selection:** Re-read the board and approved plan. G3-07 remains dependency-gated on G4; G4-01 is eligible only after confirming G3-04/G3-05 evidence and scope from the current board.

**Last updated:** 2026-10-27 — G3-06 subject profile implementation is ready for owner review with isolated migration and automated test evidence; browser UAT remains unverified. No milestone is Owner Accepted.

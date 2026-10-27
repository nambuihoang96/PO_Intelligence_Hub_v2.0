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

## Status legend

`DONE (scoped)` = verified only to recorded evidence; `IN PROGRESS` = active task; `READY` = next unblocked task; `BLOCKED` = requires external/business input; `NOT STARTED` = approved backlog; `DEFERRED` = intentionally outside current recovery.

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
| G3-02 | G3 / P0 | Persistent reusable Research Subject identity with explicit ambiguous mapping | G2-02 | IN PROGRESS | Start with contract/schema audit. No persistent subject model in inspected code. Preserve source-local keys and never auto-merge by fuzzy title; additive migration only after confirming necessity. |
| G3-03 | G3 / P0 | Project Benchmark Collections across report, trend and CSV observations | G3-02 | NOT STARTED | Existing report-local benchmark JSON is not a cross-input collection. Additive migration only if required; preserve memberships/legacy dimensions. |
| G3-04 | G3 / P0 | Trend Update capture with source note, publication date, exact claim, subject and collection | G3-02/03 | NOT STARTED | TW-01 scenario only; genuine Rotate Rings source link/file not supplied. Report claim as source-reported/unverified. |
| G3-05 | G3 / P0 | Local Image Evidence upload/attachment, hash, source context and reopen | G3-04 | NOT STARTED | Existing Evidence is Run-bound; requires compatible additive reference without changing immutable manifests. No OCR/fetch/AI. |
| G3-06 | G3 / P0 | Subject Profile and extensible analysis sections; Core Loop / Level Design / Ad Placement starter blocks | G3-02 | NOT STARTED | Keep these as optional UI blocks/extension keys, not hardcoded global domain taxonomy. |
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
- Project/Report handoff records prior targeted tests (38 frontend, 1 backend, migration), but current uncommitted changes must be rerun before DONE.
- G2-02 current candidate: 38 focused frontend tests PASS; 15 backend workspace tests PASS; TypeScript and production build PASS; isolated SQLite/Chrome UAT PASS at 1440×900. Screenshot evidence: `.bangiao/screenshots/p0-project-report-unification/`. Independent read-only review: no P0/P1 finding; browser-history back behavior remains untested.

## Defects / external inputs

1. Report-level PO notes and Project decisions are separate; current UX can route to legacy notes instead of authoritative decision.
2. Persistent Subject and reusable Benchmark Collection do not exist.
3. Trend Update, image evidence management and useful Tracking history do not exist.
4. Sensor Tower export is missing explicit GEO and date semantics; do not fill them by inference.
5. Actual Rotate Rings source note/link/image is not in current evidence; user input required for genuine source verification/UAT.
6. Full backend regression and production-history backup/restore are NOT VERIFIED.
7. Feature branch has 86 commits/158 paths relative to master; integration review is a release blocker, not permission to merge.

## Current execution cursor

**Active task:** G3-02 / P0-B Persistent Research Subject identity. Audit existing contracts and source identity semantics first; propose the smallest additive schema and user flow, preserve existing keys/notes/memberships, and use migration tests on isolated SQLite only. Do not auto-merge fuzzy names.

**Next after G3-02:** G3-03 reusable Project Benchmark Collections, only after persistent subject identity and explicit mapping are verified. If genuine-source input is needed, continue safe structural tests and mark only that acceptance scenario BLOCKED; do not invent evidence.

**Last updated:** 2026-10-27 — G2-02 verified and closed as a scoped slice; G3-02 active. No milestone is Owner Accepted.

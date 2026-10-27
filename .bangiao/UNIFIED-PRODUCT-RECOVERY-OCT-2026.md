# PO Intelligence Hub V2 — Unified Product Recovery

**Planning date:** 2026-10-27  
**Baseline:** [Full Product Recovery Audit](PRODUCT-RECOVERY-AUDIT.md), [Master Implementation Plan](../docs/PO_INTELLIGENCE_MASTER_PLAN.md)  
**Branch:** `feat/ux-recovery-01-research-results`  
**Status:** Mode B autonomous implementation was explicitly authorized by the Product Owner on 2026-10-27. Execution status and next task are maintained in [Recovery Board](../docs/RECOVERY_BOARD.md). No merge or release is authorized.

## 1. Purpose and guardrails

Recover one local-first product workflow:

**Research Project → Research Inputs → Results → Analysis & Benchmark → PO Decision → History & Tracking.**

This plan combines the already approved UI/UX, editorial Report Reader, Project/Report relationships, CSV analytics, reusable Benchmark, Trend Intelligence, persistent Subject profiles, product analysis, image evidence, PO decisions and Tracking requirements. Trend Intelligence is a context within Research, not a separate Trend Watch application.

Keep the existing `po_research_v1` contract, report IDs/content, CSV source bytes and hashes, evidence provenance, benchmark selections, PO notes/decisions and immutable Run Manifests. Add schema only after confirming reuse is insufficient; migrations are additive and tested on backup copies. Never touch production SQLite in UAT. No paid API, AI API, scraping, implicit source fetch, fabricated data, automatic merge or push.

## 2. Current baseline: actual state

### Git and workspace

- Local/remote feature HEAD: `3f4eacb666b353820183baa26a76df2335f3bd11`; local `master`/`origin/master`: `57b7167ae60729fd3221e283c7ff2433e22454a4`.
- Feature branch: **86 commits ahead, 0 behind**, with **158 changed paths (+15,098 / -151 lines)** against master. This is a significant integration risk and must be reviewed by coherent slices before merge.
- At planning start the working tree had **6 modified files and 19 untracked paths**. Modified files include the Project/Report library/breadcrumb and tests, `scripts/setup.ps1`, and a workspace test. Untracked items include `.bangiao/P0-PROJECT-REPORT-UNIFICATION.md`, `.agents/`, `.devcrew/`, and QA/scratch directories. They are user work: preserve them, do not stage or reset them. Keep launcher/setup edits outside product slices unless explicitly requested.
- The audit and screenshots were committed in `3f4eacb`; this does not commit the remaining dirty worktree. The P0 handoff records earlier test results; those results do not automatically certify the exact current dirty diff.

### Status register

| State | Current evidence |
|---|---|
| **Implemented and verified, within recorded scope** | Projects/plans/runs and immutable manifest; one-paste ChatGPT import and `po_research_v1`; Research Results/findings/evidence and unknown/unverified states; report-level benchmark and legacy PO notes; CSV import/readiness/metadata, explorer, comparisons/charts; Project PO decisions and M5-A draft safety; shared Reports library and explicit project-linking workflow recorded in the P0 handoff and current local candidate. Audit and M6-B handoffs record exact tests and isolated browser/migration checks. Do not generalize a scoped test pass into full product acceptance. |
| **Implemented but defective/incomplete** | Report and Project PO decisions are separate persistence paths. Quantitative readiness can be too generic/raw for a PO, though incompatible data is correctly withheld. Benchmark is primarily report-local, not a reusable cross-report collection. Mobile tabs/matrix affordance needs usability review even where document width fits. Project/Report changes are still dirty and must be reviewed and retested. |
| **Missing** | Persistent Research Subject profiles; reusable Project Benchmark Collections; short-form Trend Update and historical update capture; local image evidence attachments; one contextual PO decision journey for report/finding/subject/trend; unified evidence links across run/report/trend/CSV inputs; report/update/decision history and usable Tracking; optional Core Loop, Level Design and Ad Placement analyses with extensible fields. |
| **Blocked / not verified** | The actual Rotate Rings source note/link/image has not been supplied in the audited evidence; only the example claim/date is specified. The owner Sensor Tower CSV has `Unified` platform and lacks explicit GEO/date semantics, so comparisons are withheld until confirmed. Latest audit counted 15 backend workspace tests but full/report backend suites as NOT VERIFIED after hangs. Genuine owner report → decision → tracking acceptance and production-history restore are not verified. |
| **Deferred, with reason** | Automated monitoring, crawling, paid/AI APIs and automatic verification require source permissions and a separate explicit product decision. TW-01 here means capturing and organizing owner-provided updates with provenance—not claiming the app found a trend. |

### Existing data-model constraints

- `ImportedResearchReport.project_id` is nullable; there is currently no report `run_id`. Link a run only when provenance proves it; do not infer from title or date.
- `QuantitativeDataset` preserves CSV/hash and may be owned by Project and/or Report. Keep one dataset record and explain scope/compatibility; do not copy raw rows into every report.
- `POOpportunityDecision` is Project-scoped and unique by `candidate_id`; report-specific assessment/notes/next action remain in report workspace JSON. One product journey is needed without silently moving/deleting the old notes.
- Existing `SourceRecord` and `Evidence` require a `ResearchRun` and same-run source relationship. Reports instead keep source/evidence references in structured data. A shared evidence attachment needs an additive link/reference design that keeps current run records and finalized manifests intact.
- Inspected models do not have persistent Research Subject, Benchmark Collection, Trend Update, image attachment or project tracking snapshot tables. Build only the minimum additive model proven necessary; preserve historical keys and use explicit identity confirmation.

## 3. Unified product architecture

```text
Primary navigation: Research | Reports | Tracking

Research Project — shared scope and user context
├─ Research Inputs (linked records; no duplicate copies)
│  ├─ Long-form ChatGPT report → existing ImportedResearchReport / po_research_v1
│  ├─ Short Trend Update → attributed, append-only update record
│  └─ CSV dataset → existing QuantitativeDataset, Project-linked and optionally Report-linked
├─ Persistent Research Subjects — stable identity, supplied aliases/IDs, explicit mapping
├─ Results — conclusions/findings, evidence, gaps and provenance
├─ Benchmark Collections — Project-owned groups of reusable subjects
├─ Analysis — report-supplied or PO-authored extensible sections
├─ PO Decisions — one Project decision target and revision history, reachable contextually
└─ History & Tracking — saved inputs/revisions and explicit, evidence-backed comparisons
```

### Source-of-truth rules

1. A Project is the shared organizing context. Reports Library and Project report lists are filters over the same report IDs. Never copy a report to associate it.
2. A Research Subject can appear in multiple inputs and collections. Store stable local ID, exact supplied name/type, aliases and external IDs only when provided, plus provenance. Similar names are candidates for PO confirmation, not auto-merges.
3. Long reports retain their original body/hash and contract compatibility. Trend Updates are separate append-only inputs containing the exact reported claim, source title/URL/file, publication date if supplied, capture time, subject link and verification status.
4. CSV retains raw content/hash, mappings, row references, provider/methodology, scope and validation. Use it only where metric, unit, entity, GEO, platform, methodology and periods are compatible. Missing values remain unknown; publisher country is not GEO.
5. Evidence links resolve to report passage, run source/evidence, CSV filename/row, Trend Update or image. Prefer one canonical reference plus links to contexts; do not duplicate source payloads. Keep Run-bound evidence immutable.
6. Benchmark Collections are Project-owned. Dimensions come from report data or explicit PO actions. Existing report-local selections and legacy notes remain accessible; any migration needs preview, confirmation, rollback-safe additive migration and tests.
7. One PO decision must reopen from finding, subject, collection or update. Reuse/extend `POOpportunityDecision` only if its stable target and evidence semantics fit; retain old `candidate_id` and report legacy notes until a safe, explicit mapping is confirmed. Separate report recommendation from PO assessment, notes, next action, status and revision history.
8. Tracking is a timeline of saved reports, Trend Updates, CSV revisions and PO decision revisions—not an auto-monitor. Distinguish added, changed, conflicting, not mentioned and unknown. Calculate deltas only with compatible measurement definitions and coverage.
9. Core Loop, Level Design and Ad Placement are optional starter analysis sections for the game journey, not global parser or DB taxonomies. Other topics can add their own section keys/fields.
10. Image evidence stays under the configured local data root, with hash, original filename/type, attachment context and supplied caption/date. No implicit OCR, URL fetch, AI interpretation or verification.

## 4. Consolidated recovery backlog

All named core-loop functions below remain in scope for recovery; priorities are gates, not permission to drop functionality.

| Priority / slice | User outcome | Reuse and dependency | Size / risk |
|---|---|---|---|
| **P0-A Project context spine** | Finish the shared Reports Library, explicit legacy linking, Project filter and context-preserving navigation. Confirm report/CSV ownership. | Existing nullable `project_id`, APIs, dirty local P0 implementation. First gate. | **S** — exact dirty diff, broad branch, and test state need review. |
| **P0-B Persistent Subjects + Benchmark Collections** | Reopen one subject across reports/updates; organize selected subjects into a reusable Project collection. | Existing structured entities, report selections and candidate IDs. Likely additive models. | **L** — entity ambiguity and legacy selections/notes. |
| **P0-C Trend Update + image evidence** | Capture the exact source-reported update in the same Project; attach to confirmed subject/collection and reopen it with image/source provenance. | P0-A/B; current evidence is Run-bound, so a compatible additive attachment/link is needed. | **M/L** — storage/backup and shared evidence integrity. |
| **P0-D PO Decision continuity + history** | Save one contextual decision from a finding, subject or update, reopen it from each context, and retain revisions/legacy notes. | Existing Project decision, M5-A draft protection and evidence resolution. | **L** — stable target semantics and migration risk. |
| **P0-E Editorial Research Results/Report Reader** | Understand what was found, supporting source, unknowns and implications without reading raw JSON; original report remains available. | Existing ReportResults, `po_research_v1`, UI-01 approved direction. | **M** — avoid unsupported synthesis and visual regressions. |
| **P0-F CSV analytics in the same journey** | Reuse current CSV importer/charts inside Project/Report/Subject; only compatible data contributes, with readable exclusions. | Existing import/readiness/explorer/comparison. Real owner CSV scope remains blocked pending source confirmation. | **M** — false joins or metric equivalence. |
| **P0-G History & Tracking** | Review report/update/dataset/decision timeline and compare saved information without treating absence as deletion. | P0-C/D/F; current Tracking placeholder. | **M/L** — snapshot/version semantics. |
| **P0-H Product acceptance** | Pass the three genuine journeys in §7 with persistence, source integrity and responsive UI. | All P0; owner report/source artifact required. | **M** — genuine data availability and branch integration. |
| **P1 visual/reliability quality** | Peachy Studio/editorial polish, responsive controls, keyboard/contrast, high-volume CSV navigation, clear data-readiness reasons. | Stable P0 flows; current React/CSS stack. | **M** — avoid styling around unstable data contracts. |
| **P1 integration/release safety** | Review branch by logical feature, run complete regressions, and test backup/migrate/restore on isolated copies. | All changes; no production writes. | **L** — 86 commits/158 paths, shared models/CSS/navigation/migrations. |
| **P2 auto-monitoring** | No work in this recovery; reconsider only after approved source access and a separate PO decision. | None. | Deferred intentionally; never simulate live trend discovery. |

## 5. Design direction and screen specification

### Visual system

- **PO-selected personality:** Peachy Studio—warm, slightly playful and approachable, while keeping research and data presentation serious.
- **Editorial reading:** clear title/deck only when supplied, readable article measure, TOC, headings, exact report quotations and inline evidence references. Avoid fragmenting the report into KPI cards.
- **Workspace:** light calm surfaces, cream/peach accents, deep ink text, one restrained blue for navigation/focus. Green/red carry only defined semantic meaning. Verification is always text (`Source-reported`, `Unverified`, `Independently verified`), never color alone.
- **Provisional token proposal:** canvas `#FFF9F5`, surface `#FFFFFF`, ink `#263248`, muted ink `#596579`, peach surface `#FFF0E8`, peach accent `#C65B3C`, focus/navigation blue `#315DBB`, divider `#E8E2DC`. These are planning values, not screenshot-approved tokens; check text contrast ≥4.5:1 and focus/non-text contrast before implementation.
- **Type/spacing:** existing sans stack for controls, optional restrained serif for long-form body if readability tests support it; 4/8px spacing rhythm; primary body ≥16px; desktop grid gives reading/findings the width; mobile stacks instead of forcing page-level horizontal scroll.
- **Component approach:** use shadcn/ui as accessibility/interaction reference, not a new heavy dependency. Keep existing React/CSS. Use semantic SVG icons, visible focus, comfortable ~44px touch targets, reduced motion, readable chart legends/tooltips/units; never add fake content to fill empty areas.

### UI UX Pro Max use

The repository-local UI UX Pro Max skill is present and was read. Its search script ran. The editorial-grid and Soft UI Evolution results plus its contrast, focus, reduced-motion, responsive, semantic-icon and chart guidance informed this proposal. A broad generated SaaS query returned “Trust & Authority + Conversion / Motion-Driven”; that marketing/animation pattern was rejected as a poor fit. A targeted style search did not return a literal “Peachy Studio” entry, so Peachy Studio is treated as the PO-selected style direction rather than a skill-verified catalog style. No code or generated design artifact was created here.

### Screens

1. **Research / Project:** scope and project identity; primary add-input actions for ChatGPT report, short trend update and CSV; recent inputs and subjects; clear next step. Hide technical IDs/mappings by default.
2. **Editorial Report Reader:** compact project/report header and TOC; supplied conclusion/takeaways; findings linked to exact evidence; uncertainty/gaps/PO implications; original report always accessible. Show Data Sources only when relevant and readiness reasons before raw rows.
3. **Subject Profile:** stable identity, supplied type/aliases/IDs, provenance, project memberships, chronological inputs, evidence gallery, benchmark collections, decisions, and optional analysis sections. Unknown fields are not prefilled.
4. **Benchmark Collection:** selected subjects as rows, report/data-backed dimensions as columns; source and status per observation; unknowns explicit. Support qualitative and compatible quantitative evidence without forcing mobile/game taxonomy.
5. **Trend Update form/detail:** exact claim/source/title/link/published date; choose Project and confirmed subject/collection; optional local image; preview attribution before saving. Display source-reported/unverified; do not infer period or platform from rankings/headlines.
6. **PO Decision:** same Project decision reachable from findings/subjects/updates; AI/report recommendation is visually separate from PO assessment, notes, next action and status. Save/unsaved/saving/saved/failed, conflict-safe drafts, evidence and revision history.
7. **Tracking timeline:** filter by Project/subject/input; show reports, updates, datasets and decisions in date order. Explain explicit changes and unavailable comparisons; no automatic update badge without a saved update.

## 6. October 27–31 sequence

This is an aggressive target, **not a promise**. Estimated work is 7–10 focused engineer-days before independent product UAT. The five calendar days are feasible only with reuse and timely genuine owner materials. Do not silently remove P0 criteria; if a gate fails, move the target and report the blocker.

| Date | Bounded slice and exit gate | Dependency / evidence |
|---|---|---|
| **Oct 27 — Baseline/context** | Record exact HEAD/status; review the 6 dirty source/test files separately from setup changes and scratch paths; rerun targeted Project/Report tests/build; review branch diff by logical feature; finalize data ownership invariants. | No stage/reset; exact candidate PASS/FAIL and current test evidence recorded; no production DB writes. |
| **Oct 28 — Subject/collection** | Add/reuse stable subjects and a reusable Project Benchmark Collection; explicit mapping for ambiguous legacy/report/CSV entities; preserve old local selections/notes. | Depends on baseline gate. Additive migration only if necessary; demonstrate create/reopen and cross-input reuse. |
| **Oct 29 — Trend/evidence** | Capture one source-attributed update inside existing Project; attach to confirmed subject/collection and local image; preserve exact source claim and unverified status. | Depends on subject/evidence model. Demonstrate refresh/reopen, file hash and provenance; no crawler/OCR/AI. |
| **Oct 30 — Decision/history** | Save/reopen one contextual Project decision from Trend/finding/subject; revision history and timeline; optional Core Loop/Level Design/Ad Placement/custom analysis sections; old report notes remain readable. | Depends on stable target/evidence refs. Isolated SQLite end-to-end and no lost draft. |
| **Oct 31 — Integrated acceptance** | Long report, short trend, updates/tracking, compatible CSV, desktop/mobile browser UAT, backup/migration/restore copy, full backend/frontend/type/build regression and P0 fixes. | Genuine data required for Product PASS. If unavailable or a P0 fails: `RELEASE PENDING VERIFICATION` or `RELEASE BLOCKED`, not a silent scope cut. |

All features remain one Project workflow; no standalone Trend Watch navigation/module.

## 7. End-to-end acceptance scenarios

### A — Long-form ChatGPT research

1. Open/create Project; reuse its question/scope and copy the existing prompt; paste one genuine ChatGPT response once.
2. Verify original report and contract data persist; findings point to supplied source passages/URLs and remain unverified unless actually checked.
3. Open subject profiles and benchmark; link existing CSV only if metric definition, unit, methodology, entity, GEO, platform and periods are compatible. Otherwise show the reason and no fabricated chart.
4. Record a contextual PO decision/next action; refresh, reopen by Project and Reports Library, confirm same report ID, evidence and decision revision.

### B — Short-form Trend Research / TW-01

1. Capture **“Rotate Rings vượt 11,1 triệu lượt tải”**, source-note date **2026-10-21**, only when the PO supplies the source note, link or file. Preserve exact wording; absent period/method/platform/GEO remain unknown.
2. Confirm or create the Rotate Rings subject; add it to existing **Puzzle October** collection with explicit identity confirmation. Do not infer identity from similar names.
3. Open Subject Profile, add optional Core Loop, Level Design and Ad Placement analyses, attach supplied image evidence and keep the claim `source-reported · unverified` until separately validated.
4. Save a PO decision linked to that update/subject/evidence; refresh and reopen the same decision.
5. Add a later update as a new record and review explicit changes/conflicts. Do not compute growth from one claim or incompatible periods.

**Evidence availability:** the example claim/date are in the request; the genuine source artifact/link/image was not present in the audit files. This is a test scenario, not verified market data.

### C — Research Updates and Tracking

1. Open a Project with prior report, linked CSV and decision; add a new report or trend update without overwriting prior material.
2. Find both inputs under one stable Research Subject and view the Project timeline/collection.
3. Distinguish added, changed, conflicting, not mentioned and unknown. Compare numeric values only with compatible definition/unit/entity/scope/methodology/period.
4. Review evidence, update PO decision, save, refresh and reopen; prior reports, datasets, benchmark selections and decision history remain.

## 8. Release blockers

### P0 — Unified product promise

1. **Decision continuity:** current finding action lands in report legacy notes; Project decision may require a CSV shortlist and is not the same record.
2. **Stable reusable subject/benchmark:** no persistent subject profile or Project-owned reusable collection.
3. **Trend input and image evidence:** TW-01 cannot yet be saved, reused and traced inside current Project.
4. **History/Tracking:** current Tracking says setup pending; no saved update/report/decision change timeline.
5. **Dirty Project/Report candidate:** implementation exists locally but exact current diff must be reviewed/retested before treated complete.
6. **Genuine-data acceptance:** no verified complete A/B/C journey with supplied owner artifacts.

### P1 — Release confidence/usability

- Branch has 86 commits and 158 paths over master; release integration is not certified.
- Full backend/report suite is NOT VERIFIED in latest audit; 15 workspace tests passed, which is not a full pass.
- Owner Sensor Tower export lacks GEO and date semantics; correct behavior is to withhold comparison until confirmed or replaced.
- Quant readiness reasons, mobile tab/matrix affordance, and genuine CSV-to-report flow need product UAT.
- Production-history backup/restore is not verified; only isolated QA copies are safe in this plan.

### P2 — Deferred intentionally

- Automatic crawlers/monitoring, paid APIs, AI calls and automatic verification require a separately approved source-access and product policy. No fake “live trend” behavior.

**Release gate:** technical PASS + genuine-data Product PASS for A/B/C + isolated migration/backup/restore evidence + PO acceptance + explicit merge approval. Current classification stays **NEEDS FIX / RELEASE PENDING VERIFICATION**.

## 9. Recommended first implementation slice

**Recovery Slice 01: Project Subject + Source-backed Trend Update → Collection → PO Decision → History.** This fills TW-01 while establishing shared identity/evidence needed by long-form reports, CSV analytics, benchmark and tracking. It must use existing Project/Reports navigation and not create Trend Watch as another app.

Bounded success:

- Select/create one persistent subject in an existing Project; ask for confirmation only for ambiguous identity.
- Save one append-only trend update with exact source/title/date/claim and optional local image, preserving source-reported/unverified status.
- Put that subject in a reusable Project Benchmark Collection without duplicating subject identity.
- Open/save/reopen the same Project PO decision from update and subject; see prior revision in History.
- Add a second update without overwriting the first; absent/incompatible data remains unknown.
- Pass isolated migration/restore, focused backend/frontend tests, typecheck/build and actual browser UAT with a genuine owner source when supplied.

Not part of this first slice: auto-monitoring, AI synthesis, scraping, general CSV importer rewrite, or unrelated chart redesign.

**PO gate:** this document does not start implementation. First review the existing dirty Project/Report changes and approve or revise this bounded slice.

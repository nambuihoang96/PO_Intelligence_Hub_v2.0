# M6-A — System-wide Product Audit & Release Blocker Closure

**Repository:** `nambuihoang96/PO_Intelligence_Hub_v2.0`
**Branch:** `feat/ux-recovery-01-research-results`
**Reviewed starting HEAD:** `4cba3cf0887a7436c688804f1774f969831503f2`
**Audit date:** 2026-10-25

## Release decision

**RELEASE PENDING VERIFICATION.** No confirmed P0 blocker remains in the flows exercised. Two confirmed data/readiness defects were fixed and regression-tested. The business journey was exercised in a disposable SQLite workspace with the supplied CSV and a clearly synthetic research report. A genuine PO-provided structured ChatGPT report and a compatible pair of the owner’s CSV periods were not available for this UAT. The browser bridge also cannot save its screenshots into repository files, so no screenshot files are claimed.

## Starting state and safeguards

- Branch and HEAD matched the requested values. The branch had pre-existing user changes before this task.
- Preserved `scripts/setup.ps1`, `.devcrew/`, `.m1-test-tmp/`, `.m4-test-tmp/`, `.m4r1-test-tmp/`, `.test-tmp/`, `frontend/.m4r1-test-tmp/`, and the pre-existing untracked `frontend/frontend/` directory. None is included in this task’s commit.
- Browser UAT and migrations used `.m6a-browser-data/` and `.m6a-qa-migrations/`; automated backend tests used temporary roots. The default/production SQLite database was not used or changed.
- The CSV supplied for this audit was read and imported from its existing Downloads path; the source file was not edited.
- Reviewed the available M1–M5-A handoffs and the V2/B-001/UI-01/UI-02 handoffs. No separate M0 handoff document exists in `.bangiao/` in this checkout.

## Feature inventory

| Feature | Entry point and business purpose | Inputs → useful output | Test/browser coverage and limitations |
|---|---|---|---|
| Research Workspace | Research → organize a data-first study | Question/scope → saved project, source data and workspace state | API/frontend tests; browser created and reopened a disposable workspace |
| ChatGPT Research Import | Home / Import → preserve PO-provided research | Original Markdown or structured response → report, findings and sources | Backend/frontend tests; browser used a clearly labeled synthetic `po_research_v1` report; no real PO report was available |
| CSV Import | Workspace or report → retain source data and provenance | Local CSV, column mapping and explicit scope → immutable original text plus observations and validation | Real supplied CSV browser import; 27 rows, 25 source apps, 243 measurements; reload persistence confirmed |
| Data Explorer | Research Workspace → inspect saved source rows | Dataset → source identity, observations and scope | Browser checked 106-app pagination and the owner CSV; several long lists were not exhaustively browsed |
| Dataset Metadata Review | Dataset details → review missing or disputed metadata | Existing metadata plus cited correction → audited overlay and revalidation | Backend tests cover provenance, stale revision and reviewed values; no provider documentation was fabricated |
| Compare Periods | Workspace/Research → compare compatible measurements | Two datasets and explicit metric/scope → paired values, differences and evidence | Browser tested compatible synthetic multi-period data and blocking of incompatible/future windows; current owner periods are not a valid comparison pair |
| Analytics Data Selection | Report → choose source observations for charts | Report and compatible datasets → selected chartable data | Frontend/backend tests; synthetic browser data only |
| Research Charts | Report → inspect structured research metrics | Report-supplied observations → charts only for eligible supplied values | Qualitative-only report correctly remained without invented metrics; no verified real quantitative report was available |
| CSV Comparison Charts | Compare Periods → view eligible comparisons | Compatible paired observations → table/chart and point-level evidence | Synthetic browser comparison; real owner exports correctly remain blocked by scope/period/metadata limitations |
| Shortlist and prompt | Workspace → choose candidates and prepare focused ChatGPT work | Saved dataset and explicit selections → persistent shortlist and source-anchored prompt | Browser saved/reopened a shortlist and checked that the prompt retained source context; this does not call an AI API |
| Opportunity Review | Workspace → record a source-backed PO decision | Candidate, evidence and PO judgment → saved decision, priority and next action | Browser saved, refreshed, edited and reopened decisions; preserved historical decision after shortlist replacement |
| Report Benchmark and PO Notes | Report → compare selected items and record report-level notes | Structured report and PO inputs → persisted benchmark/assessment state | Regression coverage exists; M6 browser primarily exercised workspace Opportunity Review, not every report-level legacy note variant |
| Research History and Runs | Research/Reports → reopen prior reports and immutable runs | Saved reports, plans and run manifests → paginated/reopenable records | Backend migration/immutability tests; this audit did not create a real research run |

## Product workflow map

1. Import a CSV into a disposable research workspace; inspect source rows and validation.
2. Choose candidates manually or with an eligible deterministic rule; persist and reopen the shortlist.
3. Generate a ChatGPT prompt anchored to that saved dataset; research remains a user-driven ChatGPT Plus action.
4. Import the returned report, link it to the workspace, inspect findings and evidence, then return to the saved CSV context.
5. Compare periods only when entity, metric definition, unit, methodology, GEO, platform and date coverage are compatible.
6. Open Opportunity Review, attach explicit source evidence, save PO assessment/rationale/next action, refresh, and reopen historical decisions.

**Observed friction:** The owner’s actual Sensor Tower exports do not currently support a trustworthy comparison. `Unified` is retained literally; the later window extends into the future relative to the audit date, window lengths differ, methodology is absent, coverage is partial, and some percentage cells are malformed. The application blocks a fabricated ranking/comparison and exposes source rows instead. The PO still needs a valid compatible export or documented metadata before these files can support period analytics.

## Critical regression checks

### M5 decision refresh and draft safety

- Browser UAT saved a decision, refreshed the same candidate, edited it, saved again and reopened it.
- Switching candidates surfaced Save / Discard / Continue choices. A draft saved with “Save and continue” reappeared as that candidate’s persisted decision; this was not cross-candidate leakage.
- Replacing shortlist membership retained the prior decision as historical and made its saved evidence and rationale reopenable.
- Backend tests cover stale revision conflicts; refresh did not silently discard an unsaved draft in the exercised switch flow.

### Evidence readiness wording

Completion, report-scope compatibility, dataset analysis readiness, dataset comparison readiness, compatible period pairs and independent verification remain separate states. CSV values and ChatGPT references stayed unverified. In the owner CSV import, the UI kept `Unified` and unknown GEO visible rather than translating them into Android/iOS or guessing a market.

### Navigation and wording

Research, Reports, Explorer, Sources and Compare Periods were visible in navigation. Workspace entry points exposed Research Plan, Import ChatGPT Research, Data Explorer and Compare Periods. The browser exercised workspace, report, evidence, shortlist, prompt and opportunity review paths. No external source URL was fetched.

### Source fidelity and history

- Owner CSV hash from the source file: `38a7e9844c09857269ffcc849937f8059918bc0e313be55c18571d894f3e2be0`.
- Browser import showed 27 CSV rows and 25 source apps; persisted dataset retained 243 observations and the same source-file hash. Observations were explicitly unverified.
- The original CSV has UTF-8 BOM. Browser UAT revealed the importer was removing those three BOM bytes from `original_csv` while the hash still matched because hashing uses UTF-8-SIG. Fixed the local file reader to preserve the BOM while parsing it away from the first header cell. Added a frontend regression test. **Post-fix exact-file browser save/reopen is not verified**; the existing browser import happened before this last correction.
- Historical PO decision persistence after shortlist replacement was verified as above. Report-level benchmark and legacy assessment data was not overwritten by the M6 changes.

### API errors and negative paths

Automated backend coverage exercises malformed/non-numeric observations, duplicate imports, unresolved/ambiguous entity handling, incompatible scope/periods, metadata validation, and stale decision revisions. Browser UAT saw 243 incomplete measurements and 16 duplicate measurements in the supplied CSV, and exposed the readiness discrepancy fixed below. Browser network interruption/retry and 100+ report/dataset catalog pagination were **NOT VERIFIED** in this audit.

## P0/P1/P2 issue register

| Priority | Reproduction / expected vs actual | Business impact and root cause | Resolution / status |
|---|---|---|---|
| P1 — Readiness preview mismatch | Preview the 106-row CSV without provider-confirmed methodology, then save and reopen. Preview showed comparison-ready rows while persisted dataset showed zero under metadata provenance rules. | Could lead a PO to believe the dataset is comparable when persisted data is not. `_preview_dataset` did not apply `effective_observations`, unlike saved reads. | **Fixed** in `backend/app/reports.py`: preview uses the same metadata/provenance projection as a persisted dataset. Added preview/saved parity tests for incomplete and metadata-complete cases. No schema change. |
| P1 — Original UTF-8 BOM dropped | Import a UTF-8-BOM CSV through the browser. Header parsing correctly removed BOM, but `FileReader.readAsText` also removed it from stored source text. | Stored `original_csv` was not byte-equivalent to the owner source even though the stable content hash matched. | **Fixed in code** in `QuantitativeDatasetImport.tsx` by reading bytes and reintroducing BOM only when present. Added regression test proving the API preview payload keeps BOM and header preview works. Full real-browser post-fix save/reopen remains **NOT VERIFIED**. |
| P2 — Frontend bundle warning | Production build emits a minified JS bundle of 501.41 kB (143.67 kB gzip), slightly over Vite’s 500 kB warning threshold. | Small performance concern; no measured material workflow delay in the tested local journeys. | Recorded; no broad code-splitting refactor introduced in this release audit. |
| P2 — Narrow tab strip | At 390px the Report Results tabs scroll horizontally; document width remained within the viewport. | Some navigation requires a horizontal swipe, but no page-level horizontal overflow was observed. | Recorded; no release-blocking collision or clipped page content observed at tested sizes. |

No P0 was reproduced. The previously investigated apparent PO draft cross-candidate leak was not a defect: the prior candidate’s decision had been explicitly saved before switching.

## Data and evidence correctness

- `po_research_v1` and original report content were not changed by this audit.
- The synthetic report’s `example.com` reference remained unverified and was not opened.
- CSV import retained literal `Unified` platform values, missing GEO, missing methodology and malformed cells. No values, units, periods or market scope were inferred during UAT.
- The owner’s actual two Sensor Tower windows were reported by earlier handoffs as unequal and the later window future-dated; current exact files were not both reimported into this M6 browser session. Their data should not be used to assert growth until a valid comparable scope and period are confirmed.
- Research Runs/Manifests were not written in the UAT flow. Automated tests cover finalized manifest checksum and transition immutability.

## Migration and backup/restore

- Disposable migration database upgraded from base to Alembic head `20261024_0009`; `alembic check` returned “No new upgrade operations detected”; `alembic current` reported `20261024_0009 (head)`.
- `tests/test_database.py` migration regression migrated a pre-workspace schema and verified report content, benchmark selection, original CSV, project state, and immutable run manifest behavior.
- SQLite online backup was made from the disposable browser DB. `PRAGMA integrity_check` returned `ok`; all 12 table names and each table’s row count and canonical row-content SHA-256 matched the source DB.
- A separate restored copy reopened successfully with `PRAGMA integrity_check = ok`; table counts and project/report/dataset/decision identifiers matched the backup. This is a QA-only restore test, not a production recovery drill.
- No migration, reset, or production database change was made.

## Performance and robustness

- Production Vite build warning: **501.41 kB** JS minified / **143.67 kB** gzip.
- Browser loaded the 106-app dataset and paginated its Data Explorer. No measured timing instrumentation was added; this is not a formal performance benchmark.
- No N+1, large catalog (>100 reports/datasets), or prolonged memory issue was measured in this audit; those items are **NOT VERIFIED**.
- Large supplied CSV: 27 rows, 243 metric observations, 25 apps; browser preview and save completed. It showed 243 incomplete, 16 duplicate, 0 source-valid/comparison candidates. Missing/invalid data was retained with warning rather than silently converted.

## Browser UAT and responsive findings

Browser UAT ran in Codex’s in-app browser against a local frontend/backend on dedicated ports and disposable SQLite at `.m6a-browser-data/`.

| Journey / viewport | Result | Evidence and limits |
|---|---|---|
| CSV-first workspace | **PASS for exercised flow** | Created workspace, imported owner CSV, inspected preview, saved, selected saved dataset and refreshed; the dataset persisted. Shortlist/prompt flow also persisted. Exact post-BOM-fix browser round-trip remains NOT VERIFIED. |
| Multi-period analytics | **PASS with synthetic compatible QA data; owner pair NOT VERIFIED as comparable** | Six products × two compatible synthetic periods produced a paired comparison; incompatible/future periods remained blocked. The supplied Sensor Tower periods are not suitable to claim growth. |
| Research integration | **PASS with clearly synthetic report; real PO report NOT VERIFIED** | Imported/linked structured report, opened finding and evidence, source stayed unverified, report/workspace remained available after refresh. No AI/API was called. |
| PO decision | **PASS for exercised workflow** | Saved, refreshed, revised, changed candidate, resolved draft prompt, replaced shortlist and reopened a historical decision with evidence. |
| Responsive report view | **PASS for measured page overflow check** | Exact viewports 1440×900, 1024×768, 768×1024 and 390×844 had no horizontal document overflow. At 390px the tabs scroll within their own strip; PO Assessment remained reachable. |
| Responsive opportunity review | **PASS for measured page overflow check** | At 390×844 controls remained within the viewport and no page-level horizontal overflow was measured. |
| Screenshot files | **NOT VERIFIED / unavailable** | Real browser screenshots were inspected in the browser session, but the browser bridge exposes no supported filesystem export. No screenshots were written or claimed as repository files. |
| Browser network failure/retry, every legacy note variant, 100+ catalog entries | **NOT VERIFIED** | Covered only where automated tests provide a corresponding assertion; no browser claim is made. |

## Automated verification

| Check | Result |
|---|---|
| Full backend pytest suite | **144 passed**, 1 third-party AnyIO deprecation warning; run against isolated backend test roots |
| Full frontend Vitest suite | **152 passed / 15 files passed** |
| Focused CSV import component suite | **11 passed** |
| TypeScript | `npm run typecheck` — **passed** |
| Production build | `npm run build` — **passed**, with bundle-size warning recorded above |
| Alembic migration | Upgrade to head, `alembic check`, and current revision — **passed** |
| Migration/backward compatibility | Existing database regression tests in the backend suite — **passed** |
| SQLite backup and restore copy | Integrity and per-table content digests — **passed** |
| `git diff --check` | **passed** before handoff creation; rerun before commit |

The backend suite was run after the backend readiness fix and test fixture updates. The subsequent BOM correction is frontend-only; its new component regression was covered by the focused suite and full 152-test frontend rerun.

## Changed files

- `backend/app/reports.py` — align preview readiness with persisted metadata/provenance evaluation.
- `tests/test_quantitative.py` — ensure preview and save readiness parity, and keep the entity-mapping tests historical so the future-period guard does not mask their intent.
- `frontend/src/reports/QuantitativeDatasetImport.tsx` — preserve UTF-8 BOM in uploaded original CSV.
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx` — regression test for BOM preservation and header parsing.
- `.bangiao/M6A-SYSTEM-RELEASE-AUDIT.md` — this handoff.

## Known limitations

- No genuine PO-provided structured ChatGPT report was accessible for the mixed CSV/report product journey; that portion used a labeled synthetic report.
- The two actual period exports cannot currently provide a defensible comparison due to missing/ambiguous metadata, incomplete coverage, malformed cells, unequal windows and the future-ending period documented by prior handoffs. No growth claim was made.
- Exact real-browser save/reopen after the BOM fix is not verified; automated UI payload coverage passed.
- Screenshot image files could not be exported by the browser bridge.
- Network interruption/retry and catalogs with over 100 report/dataset entries were not browser-tested.
- No runtime performance benchmark or production restore drill was performed.

## Technical Acceptance

**PASS with verification limits noted.** Backend/frontend automated checks, typecheck, build, migration checks and isolated backup/restore passed. Preview and persisted readiness now share a single metadata provenance decision path. The frontend now retains BOM-bearing source text. No production data or schema was modified.

## Product Acceptance

- **PO goal:** move from source data and imported ChatGPT findings to an evidence-backed, persistent product decision.
- **User journey:** import/select CSV → inspect source and readiness → save shortlist → prepare ChatGPT prompt → import/link research → inspect insight/evidence → record decision → refresh and reopen.
- **Automated work:** retains source identity and provenance, validates readiness, blocks unsupported comparisons, persists shortlist/decision state and preserves historical decision references.
- **Expected result:** a PO can review a saved opportunity with source rows/findings, explicit gaps and a persisted assessment/next action without invented metrics.
- **Remaining friction:** current owner period exports are not comparable; genuine structured report and exact post-fix BOM browser round-trip need owner-data UAT. Screenshot file export is unavailable.
- **Verification:** synthetic multi-period workflow, actual supplied CSV import, synthetic structured report, PO decision persistence, four report viewport checks, full backend/frontend suites, typecheck/build, migration and disposable DB restore were exercised. Unverified paths are listed above.
- **Decision:** `NEEDS FIX` before declaring full product release acceptance; finish real-report/valid-period UAT and verify post-fix BOM browser save/reopen.

## Git handoff

- **Starting HEAD:** `4cba3cf0887a7436c688804f1774f969831503f2`.
- **Implementation commit:** `bda8467` (`fix(m6a): align preview readiness and preserve CSV source bytes`).
- **Push:** to `feat/ux-recovery-01-research-results`; no merge to master.

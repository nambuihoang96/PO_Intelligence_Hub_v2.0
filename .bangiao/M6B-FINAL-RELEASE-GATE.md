# M6-B — Final Release Gate & Independent Acceptance

**Branch:** `feat/ux-recovery-01-research-results`  
**Starting HEAD:** `2032636de83a3ec30d6369212a9812cdbe61629a`  
**Final status:** **RELEASE PENDING VERIFICATION**

## Release decision

The isolated QA workflows passed for the owner-provided CSV and controlled synthetic comparison/decision data. The gate is **not a production release approval**: the owner’s CSV has unknown GEO and date semantics, no owner-provided structured ChatGPT report was available for report UAT, historical production records were not part of the isolated backup/restore exercise, and mobile/tablet presentation still has usability limitations. No production database was opened or changed. No merge, deployment, or tag was performed.

## Preparation and safety

- Confirmed branch `feat/ux-recovery-01-research-results` at starting HEAD above, tracking its origin branch.
- At preflight, `master` was 76 commits behind this task branch (`master...HEAD` = `0 76`). This task did not merge master.
- Preserved pre-existing `scripts/setup.ps1` changes and unrelated untracked QA/dev files. They are not included in this task commit.
- All browser acceptance work used an isolated SQLite database at `.m6b-final-qa-20261026/po_intelligence_hub.sqlite3`; the user's local service on port 15180 was left untouched.

## Gate results

| Gate | Result | Evidence / limitation |
|---|---|---|
| A — Existing report/data compatibility | **PARTIAL PASS** | Backend regression suite passed. Existing CSV BOM/identity/idempotency and cursor tests pass. Historical production reports/manifests were not available in the isolated QA DB, so full historical compatibility is not independently verified in this run. |
| B — Owner CSV and data-first workflow | **PASS WITH DATA LIMITATION** | Imported the supplied Sensor Tower CSV in browser, created a shortlist, refreshed, and confirmed persistence. File: `Unified Top Apps Downloads YoY Growth test.csv`; 6,252 bytes; SHA-256 `38a7e9844c09857269ffcc849937f8059918bc0e313be55c18571d894f3e2be0`. It contains 27 nonempty rows and 25 unique app IDs; only `Unified` platform; no explicit GEO. Dates are `14/09/2026` and `14/10/2026`, but date semantics are not specified. UI correctly withheld comparison: 243 incomplete observations, 0 source-valid observations, 16 duplicate measurements. Publisher country was not treated as GEO. |
| C — Comparison and chart correctness | **PASS ON CONTROLLED FIXTURE** | Imported two isolated, explicitly scoped 30-day Worldwide/iOS Downloads datasets. Alpha: 900 → 1,200 (+300, +33.33%); Beta: 600 → 480 (-120, -20%). UI preserved a baseline-only and current-only entity instead of treating missing values as zero. Unequal-period experimental inputs were withheld. Synthetic values are QA-only, not market evidence. |
| D — Backup/restore integrity | **PARTIAL PASS** | Post-UAT isolated SQLite backup and restore completed. `PRAGMA integrity_check` returned `ok` for source, backup, and restored databases; IDs and table counts matched. This database contained one QA project, one synthetic report, one PO decision and five datasets, but no legacy research runs/manifests or evidence rows. Production/history restore safety is therefore **NOT VERIFIED**. |
| E — PO decision workflow | **PASS ON SYNTHETIC QA DATA** | Added explicit CSV observation and report finding as evidence, saved a PO decision and then edited/saved it again. A pending draft survived a candidate switch after choosing “Save and continue”. Refresh/reopen retained decision, priority, rationale, open question, next action and evidence selection. Evidence remained labeled unverified. |
| F — Scale/performance and reliability | **PARTIAL PASS** | Automated tests cover 250-app pagination, 101 datasets/reports cursor traversal, and existing conflict/idempotency cases. No measured performance benchmark was run. Browser network-failure/retry and concurrent-write behavior were not fully exercised. |

## Browser UAT

Browser UAT used the running local application and isolated QA database; it did not use or modify production SQLite.

- **1440 × 900:** owner CSV import, candidate shortlist persistence, compatible synthetic comparison, full comparison table/evidence, synthetic report viewer, and PO decision save/refresh/reopen were exercised.
- **1024 × 768, 768 × 1024, 390 × 844:** layout was inspected. No document-level horizontal overflow was observed. At 390px the navigation remains a horizontally scrolling strip and not all items are immediately visible; at 768px some action copy wraps narrowly. These sizes are **not a responsive UX pass**.
- A real owner-provided structured research report was unavailable: report-specific UAT is **NOT VERIFIED**. A clearly labeled synthetic QA-only report was used solely to exercise viewer and PO decision persistence; it contains no market assertions or source URLs.
- The live browser screenshots were inspected during UAT, but the available browser tool did not provide a supported export-to-file operation. No screenshot files are claimed or included.
- Browser checks were actual local app interaction, not generated mockups. Remaining mobile navigation/layout issues should be addressed before broad release.

## Confirmed defect fixed

CSV-only evidence has `report_id = null`. The comparison evidence UI previously generated a dead `/reports/null` link. Both evidence-detail and comparison-table views now render report navigation only when a report ID exists. CSV filename, row provenance and unverified status remain visible.

## Files changed by this task

- `frontend/src/reports/QuantitativeComparisonCharts.tsx` — guard report links for CSV-only evidence.
- `frontend/src/reports/QuantitativePeriodComparison.test.tsx` — regression test that ensures no link to a nonexistent report is shown while CSV provenance remains visible.
- `.bangiao/M6B-FINAL-RELEASE-GATE.md` — this gate report.

## Automated verification

- Backend full pytest suite: **146 passed**, one AnyIO deprecation warning. A later repeat attempt produced no output and was interrupted; it is not counted as a second pass. Backend source was not changed in this task.
- Frontend Vitest: **156 passed / 16 files**, including the added CSV-only evidence regression test. Test temp files were redirected to the isolated QA directory after the OS temp location produced rename `EPERM` errors.
- Frontend TypeScript check and production build: **passed**. Existing Vite warning: one bundle chunk is 501.51 kB (gzip 143.71 kB), slightly above the 500 kB advisory threshold.
- Alembic on isolated SQLite: `upgrade head` passed through `20261024_0009`; `check` reported no pending operations; `current` was `20261024_0009 (head)`.
- Backup/restore `PRAGMA integrity_check`: **ok** for all three isolated database copies.
- `git diff --check`: **passed** (only Git line-ending conversion warnings; no whitespace errors).

## Known limitations / open release blockers

1. The owner CSV omits GEO and does not define the date semantics; correct withholding is expected until the PO confirms those fields or supplies a better export.
2. No real owner-provided structured report was available for end-to-end report UAT.
3. Backup/restore was verified only for the isolated QA subset, not a copy containing historical production reports, manifests, evidence and legacy notes.
4. Responsive UX is not fully accepted: mobile navigation requires horizontal scrolling, and some tablet copy is constrained.
5. No performance benchmark or complete browser network/concurrent-write exercise was performed.
6. The bundle-size advisory remains; it did not fail build.

## Product Acceptance

- **PO goal:** Verify the release-critical data and decision workflows without risking existing local research data.
- **User journey:** Import the owner CSV → review data readiness → shortlist products → compare compatible periods → inspect a report → record and reopen a PO decision.
- **Automated work:** The app preserves source provenance, blocks invalid comparisons, retains unmatched entities, and persists shortlist/decision state.
- **Expected result:** Compatible comparison inputs produce transparent values; incomplete or mismatched inputs remain explicitly unavailable rather than being guessed.
- **Remaining friction:** Owner CSV needs explicit GEO/date semantics for usable metrics; mobile navigation is awkward; production-history restore and real-report UAT remain outstanding.
- **Verification:** Backend/frontend suites, typecheck/build, isolated migration and backup/restore checks, plus live browser flows described above. No screenshot export or real owner report verification is claimed.
- **Decision:** **NEEDS FIX / RELEASE PENDING VERIFICATION.** Suitable for continued owner review in the isolated/local workflow; not approved as a production release.

## Commit

- **Implementation commit SHA:** `531f4a7` (`fix-csv-only-evidence-report-links`).
- **Push:** pending push to `feat/ux-recovery-01-research-results`.
- **Merge/deployment/tag:** not performed.

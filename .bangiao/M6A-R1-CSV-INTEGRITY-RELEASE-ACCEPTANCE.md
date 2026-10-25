# M6-A R1 — CSV Integrity & Final Verification

**Branch:** `feat/ux-recovery-01-research-results`
**Starting HEAD:** `bce93610b495e5748bd927e00dbd452305056c68`
**Implementation commit:** `b316147` — `fix(csv): preserve legacy identity with optional BOM`
**Release gate:** `RELEASE PENDING VERIFICATION`

## Root cause and hash contract

The browser's file reader now preserves a physical UTF-8 BOM in the CSV string. The historical frontend removed it before sending the file, while backend `csv_digest()` hashes `text.encode("utf-8-sig")`. That encoding prepends a BOM even when the decoded string already begins with one. Consequently, the new path hashed a double-BOM byte sequence and failed to match historical dataset identities.

`content_sha256` is the established **canonical dataset identity**, not a raw-file checksum. The compatibility rule is: remove exactly one optional leading physical BOM from decoded text, then encode using the established UTF-8-SIG convention and hash. This maps both one-BOM and BOM-free forms to the prior identity. Additional BOMs, line-ending changes, and other content remain significant. No stored source text, dataset IDs, historical hashes, or references are rewritten. Original CSV text remains unchanged in `original_csv`.

For the owner CSV, raw physical-file SHA-256 was `38a7e9844c09857269ffcc849937f8059918bc0e313be55c18571d894f3e2be0`. In this particular BOM-bearing input it coincides with the canonical identity by encoding convention; the value is recorded as the raw-file checksum only, not used to redefine `content_sha256`.

## Implementation

Frontend duplicate lookup and backend import now use the same one-optional-BOM identity behavior. The regression tests cover historical hash compatibility, idempotent report/workspace imports, metadata review preservation, and exact original byte round trips with semicolons, quotes, CRLF, BOM and Vietnamese text. No migration was needed.

### Files changed for M6-A R1

- `backend/app/quantitative.py`
- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/csvIdentity.ts`
- `frontend/src/reports/csvIdentity.test.ts`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `tests/test_quantitative.py`
- `.bangiao/M6A-R1-CSV-INTEGRITY-RELEASE-ACCEPTANCE.md`

Pre-existing unrelated user changes were preserved and excluded from the commit, including `scripts/setup.ps1` and the pre-existing untracked folders shown in the initial Git status.

## Actual CSV and end-to-end checks

Source used: `Unified Top Apps Downloads YoY Growth test.csv` (the owner's original file; not modified).

- 6,252 bytes, UTF-8 BOM, semicolon-delimited; raw SHA-256 recorded above.
- 27 data rows, 25 distinct source apps, including two dates each for Mystery Dumpling and Surprise Dumpling.
- The CSV has no explicit GEO column, uses platform value `Unified`, and does not declare whether its `Date` is a snapshot or a reporting interval. These dimensions were not inferred.
- Isolated SQLite/API import, reopen and duplicate import verified exact original bytes, 27 persisted source rows, unverified provenance, and a single dataset after repeat import.
- Real browser UAT on the isolated local app at `127.0.0.1:15184`: selected the owner CSV, inspected its 27-row/semicolon preview and the detected wide columns, reviewed 9 recognized metric columns, ran validation, and confirmed a duplicate save. The workspace still showed **1 dataset saved** and Data Explorer remained open with its 27 rows / 25 source apps. The preview marked the data incomplete and showed 16 duplicate measurements; it did not claim comparison readiness.
- Browser responsive spot-check: page document width did not exceed viewport at 1440, 1024, 768 or 390 CSS px. Import/Data Explorer rendered in the actual browser. Detailed visual interaction coverage at each size was not performed.
- No actual structured owner ChatGPT report was available in this isolated workspace. The report import → candidate linking → PO decision part of the full journey was not verified.

## Readiness and data integrity

The owner export correctly remains incomplete for cross-period analytics without a confirmed GEO and date meaning. The same uploaded file's reporting dimensions are therefore not sufficient to support an accurate market comparison or market-growth result. The UI/API did not invent a GEO, convert `Unified` to a mobile OS, verify source references, or fabricate readiness.

The regression suite simulates the prior frontend hash behavior and verifies the same dataset is found from report-scoped and workspace-scoped imports. A report-linked dataset is reused on reimport; original measurements and reviewed metadata are retained. There is no schema change or hash rewrite.

## Test results

- Backend full suite: **146 passed, 0 failed** (Windows Selector event loop; isolated test databases).
- Focused backend CSV identity/round-trip/API regression: **3 passed, 0 failed**.
- Frontend full suite, serial worker with `--testTimeout=15000`: **155 passed, 0 failed**. The default parallel run first hit restricted temp-file `EPERM`; the first elevated parallel retry hit unrelated suite timeouts under host load. Serial run completed successfully.
- Focused frontend import + identity tests after the new invalid-UTF-8 case: **14 passed, 0 failed**.
- TypeScript check and production build: **passed** (`npm run build`). Vite emitted the existing advisory that the main JS chunk is just over 500 kB.
- Alembic isolated SQLite `upgrade head` and `alembic check`: **passed**, no new upgrade operations detected.
- `git diff --check`: **passed** for the implementation diff; Git printed a line-ending warning for the unrelated existing `scripts/setup.ps1` change.

## Verification gaps / remaining limitations

- Legacy identity compatibility is covered by a disposable test that reproduces the old BOM-stripping frontend behavior and confirms dataset ID, report/workspace linkage, observations and metadata review survive. A full production-like archive restore containing historic shortlist, benchmark and PO-decision references was not exercised.
- The available owner CSV lacks explicit scope metadata, so accurate period comparison and chart readiness cannot be accepted from this file without owner confirmation. This is a data limitation, not a reason to infer values.
- No genuine structured ChatGPT report was available for the rest of the PO workflow. Owner UAT is still required for report import, candidate linking and decision refresh/reopen.
- The >100 dataset/report pagination, interrupted decision save, concurrent revision conflict, and backup/restore acceptance cases were not executed in this R1 run. They remain independent release verification gates.
- No screenshot artifact was committed; browser states and responsive dimensions were checked live. Detailed per-viewport visual UAT is not claimed.

## Product Acceptance

- **PO goal:** Reimport the same CSV after an application upgrade without duplicate datasets or loss of the source file and existing references.
- **User journey:** Select CSV → inspect preview and detected columns → validate → save → reopen Data Explorer → reimport the same file.
- **Automated work:** Match the browser and API canonical identity, preserve exact original content, and detect duplicate imports idempotently.
- **Expected result:** The workspace continues to show one dataset with the original rows and bytes. Incomplete GEO/platform/date semantics remain visibly incomplete rather than being guessed.
- **Remaining friction:** This export does not provide an explicit GEO or date-period meaning, so the PO cannot treat it as a fully scoped comparable market dataset yet. Full PO decision journey also needs an actual structured owner report.
- **Verification:** Automated test results and real-browser import/reopen/duplicate workflow above. The full research-to-decision workflow and each viewport's detailed visual behavior remain NOT VERIFIED.
- **Decision:** `TECHNICAL PASS`; `PRODUCT PASS` is withheld pending owner data-scope confirmation and remaining workflow UAT.

## Release recommendation

**`RELEASE PENDING VERIFICATION`** — the BOM/hash integrity defect is fixed and the core owner-CSV duplicate/import path passed isolated tests and browser checks. Do not treat this as final M6-A release acceptance until the remaining owner-data and workflow gates above are verified. No merge or release was performed.

**Implementation commit:** `b3161475f2b9efc9da053eabd8b0b54d24f8a55a`

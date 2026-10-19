# UI-02A Hotfix & Acceptance

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Reviewed HEAD before changes: `8e9e9473753bbace284753baf1a483236ada1c1c`
- Implementation commit: pending
- Push: pending
- Production SQLite: not opened or modified. Browser UAT used `.test-tmp/uat-data/po_intelligence_hub.sqlite3`; backend integration tests use their isolated temporary database.

## Root cause and fix

The entity mapping selectors were rendered inside the validation preview. Changing one mapping correctly invalidated that preview, but also removed the selectors for every unresolved entity. This made it impossible to finish mapping a multi-entity CSV without losing access to the remaining choices.

The component now stores unresolved mapping requirements independently from the preview. Mapping choices remain visible and selected until a new validation response replaces the requirement list. Selecting a mapped entity or the explicit unmapped option invalidates the preview and its confirmation key. A validation revision ignores responses from earlier requests, and the confirm action is available only when the current input exactly matches a fresh preview and no unresolved mappings remain.

## Sensor Tower style workflow

Tested in the running local app with an isolated semicolon-delimited fixture containing `Unified Name`, `Unified ID`, `Platform`, `Downloads (Absolute)`, `Revenue (Absolute)` and `Weekly Downloads` columns. The fixture included two known entity IDs, one unmatched ID, multiple selected metrics, and a non-numeric metric value.

- Uploaded and previewed 3 CSV rows and all 6 columns.
- Confirmed `Worldwide`, period start `2026-10-14`, period end `2026-11-13`, and `rolling_period` in the import form.
- Selected `Unified ID` as the entity column and `Platform` as the platform column. Selected two wide metric columns and supplied their units.
- Validation surfaced `id-mystery` for explicit mapping and retained the invalid `bad-number` as an unknown/incomplete observation.
- Mapped `id-mystery` to `Beta App`, revalidated, then confirmed linking to the current report.
- The report showed the linked dataset and 6 observations after confirmation and after a browser refresh.
- The report was Android while CSV platform was `Unified`; validation reported zero scope-compatible observations. It did not reinterpret `Unified` as Android or iOS.

The browser test used synthetic UAT content and an isolated SQLite database. It did not import either of the owner’s original Downloads files.

## Browser visual QA

Actual screenshots were captured from the Codex in-app browser during the run: CSV preview/mapping, linked dataset after refresh, and the 390px mobile report/import view. The browser screenshot API emitted images in the session but did not provide a local output path, so image files could not be placed under `.bangiao/screenshots/ui-02a/`. No screenshots are represented as saved files in this handoff.

- Desktop browser viewport: 1280 × 720 CSS px (document width 1265 px). The imported dataset, readiness text, and import controls were readable; no document-level horizontal overflow was measured.
- Mobile viewport: 390 × 844 CSS px. Document width measured 375 px, so the page itself did not overflow horizontally. Main navigation and report tabs use their own horizontal scrolling containers. The Data Sources list stacked vertically and its import control remained reachable.
- Browser console: no warnings or errors observed.
- The CSV preview table is rendered in its `.quant-table-scroll` container (`overflow-x: auto`); the full mobile upload-and-map sequence was not repeated after the desktop import.

## Changed files

- `frontend/src/reports/QuantitativeDatasetImport.tsx`
- `frontend/src/reports/QuantitativeDatasetImport.test.tsx`
- `tests/test_quantitative.py`
- `.bangiao/UI-02A-HOTFIX-ACCEPTANCE.md`

## Verification

- Backend: `tests/test_quantitative.py` and `tests/test_reports.py` — **56 passed**, 1 existing Starlette/AnyIO deprecation warning.
- Frontend: **54 passed** across 6 test files.
- Targeted import component: **4 passed** (three unresolved mappings remain available; explicit unmapped option; stale validation response ignored; fresh preview required before confirm).
- TypeScript check: passed.
- Production frontend build: passed.
- Browser UAT: completed for the isolated desktop workflow and persistence refresh. Mobile layout was visually checked at 390px; full CSV upload/mapping was not repeated at mobile width.

## Limitations

- Screenshots are visible in the browser tool output in this Codex session but were not exported as repository files.
- The browser fixture deliberately had no source URL and used `Unified` against an Android report, so observations correctly remained incomplete/incompatible; this UAT checks preservation and readiness behavior, not analytics readiness.
- The two supplied Sensor Tower files were not used directly in this hotfix acceptance run.
- Unrelated working-tree changes in `scripts/setup.ps1` and `.devcrew/` were preserved and are not part of this commit.

## Final commit

Pending.

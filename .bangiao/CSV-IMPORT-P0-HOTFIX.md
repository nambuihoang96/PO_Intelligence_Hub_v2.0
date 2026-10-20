# CSV Import P0 Hotfix Handoff

## Scope

Branch: `feat/ux-recovery-01-research-results`

This hotfix addresses CSV mapping and review usability for Sensor Tower style exports. It preserves the uploaded CSV as the source file and does not add schema migrations or infer missing metrics.

## Changes

- Entity mapping accepts identifier and display-name columns. It checks IDs and names against report entities, fills the canonical entity name on a match, and surfaces only unresolved or conflicting rows for review. Metric columns such as `Downloads (Absolute)` are not offered as entity choices.
- GEO, Platform, Period, Granularity, Unit, Source, and Methodology mappings are constrained by semantic header type. A title/category header such as `All Title` cannot be mapped to GEO.
- Worldwide and ISO date ranges parsed from a filename are suggestions only. The user must explicitly confirm them. `Platform=Unified` remains Unified.
- Sensor Tower wide metrics are identified by metric identity and unit. Absolute Downloads YoY Growth and percentage YoY Growth receive distinct IDs and units. Downloads, Revenue, and DAU are recognized. Duplicate metric identities and invalid numeric/percentage units are rejected with actionable feedback.
- The flow is organized as upload → automatic mapping → exception review → explicit confirm/import, with a preview and responsive layout.

## Verification

- Frontend regression suite: 86 passed across 9 files.
- Frontend production build and TypeScript check: passed (`tsc --noEmit`, Vite build).
- Backend quantitative regression suite: 34 passed.
- Browser UAT used an isolated SQLite database and a synthetic two-row CSV. Automatic entity ID/name matching succeeded without per-row mapping; the filename scope was explicitly confirmed; `Unified` was preserved; 18 metric observations were imported.
- UAT showed 0 complete observations and 18 scope-compatible observations. They remain incomplete because the sample did not provide granularity and Revenue currency was unknown. This avoids filling in unsupported assumptions.
- `git diff --check`: passed.

## UAT screenshots

- [Review and automatic mapping](screenshots/CSV-IMPORT-P0-01-review.jpg)
- [Confirmed scope and preview](screenshots/CSV-IMPORT-P0-02-preview.jpg)
- [Imported dataset summary](screenshots/CSV-IMPORT-P0-03-imported.jpg)

## Data and release status

UAT data was written only to a disposable, isolated database under the task workspace. The original CSV and application data were not modified. No merge to `master` was performed. The task branch is ready for PO review.

## Follow-up from PO screenshot

- The CSV banner now explicitly distinguishes the total number of data rows from the three-row sample shown on screen.
- Steps and actions now explain that preview does not save data and identify the final action as saving observations to the report.
- If the API returns `Unsupported mapped field(s): entity_name`, the UI explains that validation did not import data and directs the operator to restart `run.bat` from the updated task-branch checkout.
- Follow-up frontend regression: 87 passed across 9 files; TypeScript check and production build passed.

## Follow-up from second PO screenshot

- Entity names are normalized for Unicode and repeated whitespace before exact matching, so harmless line breaks or spacing in export cells do not force manual mappings.
- Unresolved entity choices show the CSV display name alongside its ID.
- Unresolved rows use their CSV ID/name for duplicate detection. Different unmapped apps with identical metric values are no longer falsely counted as duplicates because their canonical entity ID is null.
- The preview now surfaces the exact GEO/platform scope mismatch returned by validation and explains that `Unified` remains unchanged.
- Follow-up regression: backend 36 passed; frontend 88 passed across 9 files; TypeScript check and production build passed.

## Purpose and mapping clarity

The importer adds CSV measurements to the current report so they can be reviewed and compared with that report's scope. It keeps the original CSV unchanged. The UI now states this purpose directly, shows the selected entity ID or name in the selector, and excludes dates, categories, publisher identifiers, and publisher names from metric choices.
- Follow-up frontend regression: 89 passed across 9 files; TypeScript check and production build passed.

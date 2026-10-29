# PO Hub — Final Research Acceptance R2

Date: 2026-10-30
Branch: `feat/ux-recovery-01-research-results`
Starting HEAD: `954005821ab16507666d358f9b971d59e8c4d292`

## Gate summary

| Gate | Result | Evidence |
|---|---|---|
| Genuine report files and schema | **PASS** | Both `qa-input/` files exist; current `POResearchPayload` validates. |
| Isolated import and original-content retention | **PASS** | One report in isolated QA; stored report body matches the marked original text exactly and its SHA-256 matches. |
| Desktop report workflow | **PASS** | Overview → Findings → Entities → Evidence → Benchmark → Report Notes → Project Decision → Tracking; refresh/reopen and duplicate import checked. |
| 11 quantitative observations | **PASS — interpreted without fabrication** | All 11 are shown as report-supplied and unverified; 5 comparison-ready in two compatible groups, 6 download observations not ready because method is missing. |
| Charts | **PARTIAL / DATA-LIMITED** | Two same-metric/scope/period comparison groups render. No time series, growth, or cross-provider chart is justified by this report. |
| Mobile 390×844 | **FAIL — visual gate open** | Real screenshot shows clipped report title, section navigation, and content at the right edge. |
| Frontend regressions, TypeScript, build | **PASS** | 26 files / 235 tests; `npm run build` includes `tsc --noEmit`; Vite production build succeeded. |
| Backend full suite | **PASS — prior verified run** | 177/177 was verified in the preceding closure and intentionally not rerun; this task changed no backend or migration code. Current live API import/duplicate flow passed. |
| Product acceptance | **PENDING / NEEDS FIX** | No owner acceptance inferred; mobile clipping remains. |

## Input and validation

- Original wrapper: `qa-input/Pasted text(1).txt`
- Extracted payload: `qa-input/Puzzle_2026_po_research_v1.json`
- The report body was taken only from the wrapper's `BEGIN ORIGINAL REPORT` / `END ORIGINAL REPORT` markers. The JSON embedded in the wrapper is semantically equal to the standalone JSON; formatting/newline representation differs.
- `POResearchPayload.model_validate` passed without editing or repairing the research payload.
- Contract counts: 6 findings, 10 entities, 6 evidence references, 4 benchmark dimensions, 8 research gaps, 11 quantitative observations.
- The report body stored in SQLite is exactly equal to the marked source block including CRLF line endings. The persisted content hash was recalculated and matched.
- Wrapper metadata used for import: question “Game puzzle nào đang đứng đầu thị trường năm 2026”, GEO Worldwide, period 2026, platform Cross-platform. No claim in the report body was added or rewritten.

## QA import and browser route

- QA frontend: `http://127.0.0.1:15322`
- QA report: [Open Puzzle 2026 QA report](http://127.0.0.1:15322/reports/1462660e-dff7-4ae6-a083-2d5866b783a2)
- Project: `Puzzle 2026 — Genuine Report QA` (`913290d1-5fc2-455e-b51f-b5655f797890`)
- Report ID: `1462660e-dff7-4ae6-a083-2d5866b783a2`
- Database: `.puzzle-2026-final-qa-20261029/po_intelligence_hub.sqlite3`; this is isolated QA data, not production.
- SQLite checks: `integrity_check=ok`; zero foreign-key violations; one report row for the project.
- A duplicate POST returned the existing report ID. It did not create a second report, clear the two selected benchmark entities, overwrite the saved PO report note, or remove the project decision.

## Quantitative observations and chart decision

All 11 measurements remain `report-supplied` and `unverified`; no source was independently fetched or verified.

| Group | Observations | UI treatment |
|---|---:|---|
| AppMagic net IAP, Worldwide, iOS App Store + Android Google Play, H1 2026 | 3: Puzzle 4.9B USD; Match-3 2.5B USD; Merge 1.3B USD | Comparable as one report-supplied period/scope group. These are not treated as a time series or growth. |
| AppMagic monthly net IAP, same scope, September 2026 | 2: Gossip Harbor 99.1M USD; Royal Match 91.3M USD | Comparable as a separate September group. Not combined with H1 totals. |
| H1 / September download observations | 6 | Values are retained and visible in the report, but omitted from comparison charts because methodology is absent or provider/method differ. |

The FoxData store-specific values and AppMagic estimates are not merged. Sensor Tower appears as a source reference but contributes no quantitative observation in this payload. No growth, annual winner, or cross-provider ranking was calculated. Source references remain unverified; source locations are not supplied.

## Browser UAT

Actual running application, isolated QA database:

1. Opened the report from Research/Project context; Overview showed the report-supplied executive conclusion and takeaways.
2. Findings: opened the six report findings and their evidence/recommendation context.
3. Entities: reviewed all ten entities without assigning verification.
4. Evidence: reviewed six source references and all eleven quantitative observations; source locations remained “not provided” and statuses remained unverified.
5. Benchmark: explicitly selected Royal Match and Gossip Harbor; the compatible September values were displayed with missing/unverified states where applicable.
6. Report Notes: saved a QA-labeled assessment, note, and next action on Royal Match; navigated away, reopened, and confirmed all three persisted.
7. Project Decision: saved a QA-labeled “Tìm hiểu thêm” decision linked to the real report finding; Tracking displayed the saved decision and next action.
8. Refreshed/reopened after duplicate import; the same report ID, note, two benchmark selections and project decision remained.

Desktop functional flow **PASS**. Mobile visual gate **FAIL** because the captured 390×844 viewport visibly clips content. No Product Pass is claimed.

## Screenshots

Captured from the running QA application. Desktop images are 1440×900; mobile is 390×844.

| View | Screenshot |
|---|---|
| Overview with genuine report and quantitative section | [Desktop Overview](screenshots/puzzle-2026-final-uat/overview-desktop-1440x900.png) |
| Findings | [Desktop Findings](screenshots/puzzle-2026-final-uat/findings-desktop-1440x900.png) |
| Entities | [Desktop Entities](screenshots/puzzle-2026-final-uat/entities-desktop-1440x900.png) |
| Benchmark | [Desktop Benchmark](screenshots/puzzle-2026-final-uat/benchmark-desktop-1440x900.png) |
| Report Notes | [Desktop Report Notes](screenshots/puzzle-2026-final-uat/notes-desktop-1440x900.png) |
| Mobile defect evidence | [390×844 Overview — clipped](screenshots/puzzle-2026-final-uat/overview-mobile-390x844.png) |

An Evidence-tab-specific image was not saved. Evidence content and source statuses were verified in the real browser; the Overview screenshot also shows the actual source rail. Debug captures/logs in the QA screenshot folder are intentionally excluded from the commit.

## CSS reproducibility and local changes

`frontend/src/peachyStudio.css` is modified in the working tree and was not staged. Its local diff affects the Reports Library heading, single-report Project layout, compact Project journey, and mobile report journey layout. Therefore the screenshots represent the current working tree, including this local CSS, and **are not reproducible from starting HEAD alone**. The mobile defect remains even with that local CSS applied.

Unrelated local `scripts/setup.ps1` changes, QA databases, source inputs, logs, scratch directories, and other existing untracked files were preserved and excluded. No production database was opened or modified.

## Tests and build

- Frontend: `npm test` — **26 test files, 235 tests passed**. First run hit Windows `EPERM` while Vitest renamed files in the OS temporary directory; reran with `TEMP`/`TMP` pointed at the isolated QA workspace and all tests passed.
- TypeScript: **PASS** (`tsc --noEmit`, via production build).
- Production build: **PASS** (`vite build`); existing advisory notes the main JS chunk exceeds 500 kB.
- Backend full suite: **177/177 PASS in the preceding closure**; not rerun because the request explicitly said not to repeat migration work and this task changed no backend code.
- Current schema/live API: `POResearchPayload` validation, report import, duplicate response, report reads and saved-state browser checks **PASS**.

## Remaining issues

- **P1 — Mobile report clipping:** title, navigation, and body content clip horizontally at 390×844. This blocks mobile visual acceptance. The owner-local CSS diff is not included in this task commit; fixing/reconciling it should be a separate, explicit CSS review change.
- **Data limitation:** six download observations lack compatible methodology and remain uncharted; they are still visible as original report values. This is not an application error and must not be “fixed” by inferring methodology.
- **Evidence limitation:** source URLs and source locations were not independently verified; all six source refs and all eleven observations remain unverified.
- **Screenshot reproducibility:** screenshots include uncommitted `peachyStudio.css` changes and do not prove the exact starting HEAD's visual output.

## Product Acceptance

- **PO goal:** use one genuine ChatGPT report as a durable workspace artifact and follow its findings into evidence, comparison and a PO decision.
- **User journey:** report opened → findings/entities/evidence reviewed → two subjects selected in Benchmark → report note saved → project decision saved → Tracking opened → refresh and duplicate reopen checked.
- **Automated work:** current schema validation, isolated import, content hash, duplicate resolution and persistence checks used the supplied data without synthesizing research.
- **Expected result:** report content and 11 supplied observations remain available; two compatible IAP groups are shown without mixing periods/providers; PO work survives reopen.
- **Remaining friction:** mobile content clipping; source verification and six download methodologies are absent from supplied data.
- **Verification:** 235 frontend tests, TypeScript/build, schema validation, live import/duplicate and desktop browser workflow passed. Mobile screenshot was inspected and failed visual acceptance. Backend 177/177 is prior verified evidence, not rerun in this task.
- **Decision:** **NEEDS FIX / OWNER REVIEW PENDING**. No Product Acceptance.

## Commit

Handoff and screenshot commit: `730c1f0` (`docs: close genuine Puzzle 2026 research UAT`). This SHA is recorded by the follow-up metadata commit that contains the final document version.

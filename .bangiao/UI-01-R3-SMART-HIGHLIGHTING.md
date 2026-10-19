# UI-01 R3 — Smart Highlighting & Visual Polish

**Branch:** `feat/ux-recovery-01-research-results`  
**HEAD before R3:** `4ef642b56db161e295b17c821181e49e60cd3cbd`  
**Status:** Awaiting Product Owner visual review

## Delivery summary

Added a reusable, safe, presentation-only `ResearchTextHighlighter` and applied it consistently to report conclusion, takeaways, finding cards, PO implications, insight list/detail, scope, uncertainty, and supplied observation values. No API, backend, database, or research-contract changes were made.

The component preserves the exact source text and uses React text nodes; it does not inject HTML or create research records. It recognizes explicit ranking positions, report-supplied `Top ...` category phrases, metric-like values, and explicit periods. It only colors a metric as increasing/decreasing when nearby report wording explicitly gives that direction. It does not infer units, calculate growth, or verify evidence.

Finding type icons continue to use the existing semantic icon mapping with its neutral fallback. Evidence remains labeled unverified when the report/backend does not confirm verification. A browser check exposed a layout regression in the takeaway number markup; the markup and CSS were corrected before final verification.

## Files changed

- `frontend/src/reports/ResearchTextHighlighter.tsx` — reusable deterministic inline renderer.
- `frontend/src/reports/ResearchTextHighlighter.test.tsx` — token, safety, date, language, and fallback-icon tests.
- `frontend/src/reports/ReportResults.tsx` — consistent highlighting across overview and insight contexts.
- `frontend/src/reports/ResearchIntake.test.tsx` — overview/detail integration and evidence status regression test.
- `frontend/src/style.css` — restrained rank/category/metric/period treatments and takeaway layout correction.
- `.bangiao/screenshots/ui-01-r3/` — actual screenshots from the running application.

## Screenshots and browser UAT

Browser UAT used the existing imported report “Các game DIY tạo động lực như nào cho người chơi” through the Codex in-app browser. The app used an isolated copy of the SQLite file; no production database or report data was modified.

- [Overview, first viewport](screenshots/ui-01-r3/overview-first-viewport.jpg)
- [Overview at 1440 × 900](screenshots/ui-01-r3/desktop-1440x900.jpg)
- [Findings cards](screenshots/ui-01-r3/findings-qualitative.jpg)
- [Insight detail with source references and unverified status](screenshots/ui-01-r3/insight-detail.jpg)
- [Tablet at 768 CSS px](screenshots/ui-01-r3/tablet-768.jpg)
- [Mobile full-page at 390 CSS px](screenshots/ui-01-r3/mobile-fullpage.jpg)
- [Desktop at 1280 × 720](screenshots/ui-01-r3/desktop-1280x720.jpg)

Checked report navigation and opened a report finding from its View Insight action. Insight detail displayed its report-supplied finding, scope, PO implication, uncertainty, and source references. The source status remained unverified. The saved PO assessment remained visible in the isolated report copy.

Responsive measurements were taken at 1440 × 900, 1280 × 720, 768 × 900, and 390 × 844 CSS pixels. `document.documentElement.scrollWidth` did not exceed the viewport width at any checked size. Finding card widths at those sizes were respectively 370px, 450px, 471px, and 319px. These checks establish no horizontal page overflow; they do not represent device hardware testing.

### Visual comparison and limitation

The mockup’s restrained blue rank/category treatments and compact metric chips informed the visual language. The actual imported DIY report available in local history contains qualitative findings and evidence, but no ranking positions, download comparisons, or metric values to display. No ASMR report with those claims was available in the imported report history. Therefore:

- Qualitative overview, finding cards, insight detail, sources, and responsive page layout: browser verified with real imported report data.
- Ranking/category/metric visual appearance on an actual imported report: **NOT VERIFIED** in browser; recognition and rendering are covered by component and integration tests using explicit test fixtures. The owner’s illustrative screenshot values were not copied into report data or presented as real results.
- Persistence mutations were not exercised in this presentation-only task; browser UAT did not modify assessment, benchmark, or report data.

## Test results

- Frontend tests: **passed** — 4 files, 45 tests.
- TypeScript check: **passed** (`npm run typecheck`).
- Production build: **passed** (`npm run build`).
- Backend regression tests: no backend or contract code changed; no backend test files were present in the repository tree inspected for this task.
- `git diff --check`: passed before handoff creation; rerun before commit.

## Data integrity and known limits

- Original report text and structured research fields remain unchanged.
- Highlighting is display-only; it does not alter evidence, scope, verification, benchmark selections, assessments, notes, next actions, or saved reports.
- This report data has no rank/metric examples; screenshot evidence cannot honestly demonstrate those colors without another actual imported report containing them.
- The deterministic phrase recognizer is intentionally conservative and may leave ambiguous ranking categories or metrics unhighlighted.

## Commit

Implementation commit SHA: `836f096` (`feat(ui): add research text highlights (UI-01 R3)`).  
Handoff/report commit SHA: recorded in the final review response after the report commit.  
Push: pending.

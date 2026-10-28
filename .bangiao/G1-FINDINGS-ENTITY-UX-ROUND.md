# G1 — Findings and Entity/Benchmark UX Round

Date: 2026-10-29
Branch: `feat/ux-recovery-01-research-results`
Starting HEAD: `dd62a8e9ed81fd3e94ba2bfd6f090246000c1084`
Status: `DEV_DONE / TECHNICAL BROWSER UAT PASS / OWNER REVIEW PENDING`

## Owner feedback and scope

The owner requested one bounded UX refinement for the Findings and Entity/Benchmark screens. Classification: UI/UX rework. Impacted the existing Report Results React view, its visual styles, icon sizing, and focused frontend tests. Backend, API contract, database schema, migrations, report IDs, original report content, and production SQLite were not changed.

## Changes

- A report with one finding or one entity opens directly into its detail; it no longer shows a one-item selector.
- Reports with multiple findings/entities show a selectable list and the selected detail in the adjacent content area. Mobile stacks the selector and detail vertically.
- Finding detail follows the requested order: finding, evidence, unknowns, report-supplied PO implication, linked research objects, original-report support, and PO decision state.
- Evidence is shown with the selected finding/entity and the side rail links to the full source list instead of repeating source cards.
- Report recommendations, unsaved PO draft, and confirmed PO assessment/notes/next action are labeled separately.
- Finding assessment remains a single primary action; benchmark membership and other actions remain available under progressive disclosure.
- Entity detail is domain-neutral, displays report-supplied type/name/description, linked findings and source references, and one add/remove comparison control. “Open comparison” carries the selected entity context.
- Decision fields use a readable single-column layout in the available editor width. Evidence title/location no longer runs together on narrow screens. Semantic SVGs have consistent default dimensions.

## Visual review

The supplied Peachy references informed the existing report-shell styling. This round keeps that shell and focuses the selected subject in a single detail surface; it does not reproduce the entire reference composition or change the rest of the app. Desktop and mobile screenshots below are real captures from the running local QA app. QA-only text is explicitly labeled and is not research evidence. The example links use `example.invalid`; they were not opened.

| Screen/case | Real browser capture |
|---|---|
| One finding, 1440×900 | `screenshots/g1-findings-entity-ux/findings-1440x900.png` |
| One finding, 390×844 | `screenshots/g1-findings-entity-ux/findings-390x844.png` |
| Multiple findings, 1440×900 | `screenshots/g1-findings-entity-ux/findings-multiple-1440x900.png` |
| Multiple findings, 390×844 | `screenshots/g1-findings-entity-ux/findings-multiple-390x844.png` |
| One entity, 1440×900 | `screenshots/g1-findings-entity-ux/entity-1440x900.png` |
| One entity, 390×844 | `screenshots/g1-findings-entity-ux/entity-390x844.png` |
| Multiple entities, 1440×900 | `screenshots/g1-findings-entity-ux/entities-multiple-1440x900.png` |
| Multiple entities, 390×844 | `screenshots/g1-findings-entity-ux/entities-multiple-390x844.png` |
| Zero findings/entities, text-only report, 1440×900 | `screenshots/g1-findings-entity-ux/text-only-empty-results-1440x900.png` |
| Zero findings/entities, text-only report, 390×844 | `screenshots/g1-findings-entity-ux/text-only-empty-results-390x844.png` |
| Entity opened in Benchmark, 1440×900 | `screenshots/g1-findings-entity-ux/benchmark-context-1440x900.png` |
| PO assessment after save and refresh, 1440×900 | `screenshots/g1-findings-entity-ux/po-decision-saved-after-refresh-1440x900.png` |

### Comparison against the approved direction

- **Matched:** one clear selected finding/entity; plural selector-to-detail hierarchy; evidence and unknowns are next to the item they support; PO recommendation is visually distinct from PO-owned state; selected entity context reaches Benchmark; responsive stacked content at 390px.
- **Intentional differences:** existing report header, project context and supplemental source rail remain because this round does not rebuild the reader shell. At mobile widths, the detail follows the selector in a vertical flow rather than preserving a desktop split view.
- **Remaining limitations:** screenshots use clearly labeled QA-only content. No genuine owner-provided structured research report was available for this round. These captures demonstrate layout and interaction, not product acceptance or the truth of any research conclusion. Full-app visual acceptance remains pending for G1-01/G1-03.

## Verification

- Frontend suite after final CSS changes: **26 test files, 230 tests PASS**.
- TypeScript: `npm run typecheck` **PASS**.
- Production bundle: `npm run build` **PASS**; existing Vite advisory remains for the ~627 kB JS chunk.
- `git diff --check`: **PASS**.
- Browser: isolated Chrome QA browser at frontend `127.0.0.1:15310`, backend `127.0.0.1:15311`, QA DB `.peachy-g1-qa-20261028`.
  - Zero structured findings/entities: text-only state kept the Findings and Entity destinations hidden, showed structuring guidance and no fabricated content at both 1440×900 and 390×844.
  - One finding/entity: correct detail, evidence/source status and PO recommendation rendered at desktop and mobile; document width stayed within the viewport (1425px content width at 1440px due to scrollbar; exactly 390px at mobile).
  - Multiple finding/entity lists: selecting the second QA-only item opened its matching detail at desktop and mobile; no page overflow.
  - Entity comparison: remove → refresh → restore → refresh returned to the original selected state; “Open comparison” showed the exact entity context.
  - PO workflow: entered QA-only assessment, note and next action; saved, refreshed, reopened the same finding and confirmed all three values. Restored the QA DB to its original empty PO fields and sole `qa_entity` membership; verified the restored state through the backend read API.
  - `example.invalid` references were not opened. No external URLs were fetched.
- Backend tests were not rerun because no backend/API/schema code changed. Persistence was exercised against the existing API and isolated SQLite QA database in the real browser.
- Production SQLite was not accessed.

## Product Acceptance

- **PO goal:** inspect report-supplied findings and research subjects, see their support and unknowns, and act on them without confusing report recommendations with PO decisions.
- **User journey:** open report → select a finding or entity when multiple exist → inspect linked evidence/unknowns → record or reopen PO assessment → add/remove entity from comparison and open the same context in Benchmark.
- **Automated work:** choose a direct-detail layout for a single item; provide list/detail selection for multiple items; keep source links and provenance attached to their supplied finding/entity; reuse existing PO and benchmark persistence APIs.
- **Expected result:** a readable, domain-neutral Findings and Entity view that remains navigable on desktop and mobile and retains PO data after reload.
- **Remaining friction:** genuine report data and overall G1 shell/Project Home acceptance have not been reviewed in this round. Multi-item browser data was injected as QA-only response data and was not saved as research.
- **Verification:** 230 frontend tests, TypeScript, production build, actual Chrome desktop/mobile interactions, source-empty and plural QA states, membership refresh/restore, and PO save/refresh/reopen.
- **Decision:** `TECHNICAL PASS / PRODUCT REVIEW PENDING`. This is **not** `PRODUCT PASS` or owner acceptance.

## Changed files

- `frontend/src/reports/ReportResults.tsx`
- `frontend/src/reports/ResearchIntake.test.tsx`
- `frontend/src/ui/ResultsIcon.tsx`
- `frontend/src/style.css`
- `docs/RECOVERY_BOARD.md`
- `.bangiao/G1-FINDINGS-ENTITY-UX-ROUND.md`
- `.bangiao/screenshots/g1-findings-entity-ux/` (real Chrome captures listed above)

Implementation commit SHA: pending commit.

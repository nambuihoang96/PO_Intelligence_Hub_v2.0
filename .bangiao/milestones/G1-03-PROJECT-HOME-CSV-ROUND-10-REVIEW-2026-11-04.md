# G1-03 — Project Home and CSV round 10 review

**Date:** 2026-11-04  
**Status:** `IMPLEMENTED / FOCUSED CHECKS PASS / QA BROWSER UAT PASS / READY_FOR_OWNER`  
**Scope:** Existing Project Home and project CSV analysis only.

## Owner feedback

Planner browser UAT found low-contrast dark-mode text on Project Home and CSV controls, warning states, source details and comparison highlights. Project Home showed the latest report title and counts without a clear conclusion. CSV source copy was too small. The table must remain usable on mobile without page-level horizontal overflow.

## Changes

- Dark-mode Project Home headings and selected navigation now have clear foreground/background contrast.
- CSV settings, import and secondary buttons, selected pair, warning/status strips, source details, saved shortlist and signal text now use readable dark colors.
- Core CSV/source copy is larger. On narrow screens, product observations display as contained cards; opening the table no longer expands the page beyond the viewport.
- Project Home shows the actual report title, scope and available counts, then provides one explicit source path: **Mở báo cáo để xem kết luận**. The report-list API does not contain an executive summary, so no highlight was invented.
- Preserved the neutral CSV latest-file label, exact file link, existing comparison eligibility rules and one main project action.

## Verification

- Focused tests: `ProjectHome.test.tsx`, `DataFirstWorkspace.test.tsx`, `CsvAutoAnalysis.test.tsx`, `ProjectThemeToggle.test.tsx`: **4 files / 33 tests PASS**.
- `npm run build` (TypeScript + Vite): **PASS**, 81 modules. Vite retained its existing JavaScript chunk size advisory at **763.98 kB**.
- Actual running app reviewed at `http://127.0.0.1:5173` in CUA. Desktop (~1280×720): Project Home dark mode and CSV comparison/source state. Mobile (390px): Project Home light/dark, CSV comparison and expanded source table. After opening the mobile source table, `document.documentElement.scrollWidth` was **375px** for a **390px** viewport.
- Browser screenshots were captured and visually inspected in the CUA session but were not saved as repository files. Synthetic CSV data was clearly labeled; this is not market-data acceptance. No production data was changed and no Codex/ChatGPT inference was called.
- UI UX Pro Max was loaded and used. No independent reviewer context was requested or used. No full suite or repo-wide scan was run.

## Product Acceptance

- **PO goal:** See the latest project output and next step, then understand CSV measurements and their source without technical knowledge.
- **User journey:** Project Home → review report title/scope/counts and open the report for its conclusion → open the latest CSV → inspect one-file distribution or explicitly compare two selected periods → open source rows/table when needed.
- **Automated work:** Preserve the exact report and CSV source context, calculate only source-backed distributions and compatible period deltas, expose provenance and row references, and keep the narrow-screen table inside the viewport.
- **Expected result:** A readable factual result, a single main project action, an explicit report source path and a usable CSV workflow in both themes.
- **Remaining friction:** The project report-list API lacks the report executive summary, so the PO must open the report for its conclusion. Synthetic QA data does not establish market-data acceptance. Screenshot files were not persisted. Owner visual acceptance is pending.
- **Verification:** 33 focused tests, production build, desktop/mobile CUA review and mobile width check above.
- **Decision:** `NEEDS FIX / READY_FOR_OWNER`. Do not claim Product Pass until the owner explicitly accepts this rework.

## Next action

Present the revision for owner review. Do not expand this work to unrelated modules or run the full suite without a specific need.

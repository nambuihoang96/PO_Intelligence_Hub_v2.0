# G1-03 — Project Home → CSV hierarchy rework

**Date:** 2026-11-04  
**Status:** `IMPLEMENTED / FOCUSED CHECKS PASS / BROWSER UAT NOT VERIFIED / OWNER VISUAL REVIEW PENDING`  
**Scope:** Existing Project Home and selected project CSV analysis only.

## What changed

- Project Home has one primary action: continue a saved PO task when present, otherwise start or repeat research.
- Added a “Thay đổi cần xem” entry for the newest saved CSV. It displays existing filename, product count, metric count and import date, links to that dataset, and explains verification/comparison limits.
- Kept report source visible beside a saved PO task. The extra Tracking button was removed; the in-card decision link is now secondary text.
- CSV analysis places its existing automatic summary and chart before product details. Long chart labels can wrap. The product table is behind a native disclosure, and CSV import is a secondary action.
- Reduced card and badge density in the scoped theme prototype. Existing light/dark preference and CSV analysis/data behavior remain in place.
- No data, schema, comparison logic, or external AI calls changed.

## Verification

- Focused tests: `ProjectHome.test.tsx`, `DataFirstWorkspace.test.tsx`, `ProjectThemeToggle.test.tsx`: **3 files / 26 tests PASS**.
- `npm run build` (TypeScript and Vite): **PASS**, 81 modules; the existing large-chunk advisory is 763.21 kB.
- First test launch encountered an EPERM renaming Vitest's external temporary directory. The same focused tests passed on retry using a project-local temporary directory.
- Browser screenshot and visual UAT: **NOT VERIFIED**. No running-app screenshot was captured in this round. Component checks do not prove the hierarchy, spacing or chart-label quality in a real browser.
- No full suite, repo-wide scan, model call, migration, merge or release was performed.

## Product Acceptance

- **PO goal:** Find the next project action and review useful, clearly sourced CSV signals without understanding technical details.
- **User journey:** Project Home → read the next task/source and latest CSV under “Thay đổi cần xem” → open CSV analysis → review its summary/chart → open the table or import only when needed.
- **Automated work:** Link directly to the selected saved dataset, retain existing comparison and missing-data rules, disclose detailed table content on demand, and preserve the theme selection.
- **Expected result:** One clear primary action and an easy-to-scan CSV result with source, scope and uncertainty visible.
- **Remaining friction:** Desktop screenshots and visual review of both themes, chart labels, keyboard focus and disclosure/navigation are pending.
- **Verification:** 26 focused tests and TypeScript/build passed; Browser UAT was not verified.
- **Decision:** `NEEDS FIX / OWNER VISUAL REVIEW PENDING`.

## Next action

When the isolated app is reachable in a local browser, inspect only Project Home and the selected CSV view at desktop size in both themes. Capture screenshots and review source/readiness, chart labels, table disclosure, keyboard focus and return navigation. Keep other modules untouched.

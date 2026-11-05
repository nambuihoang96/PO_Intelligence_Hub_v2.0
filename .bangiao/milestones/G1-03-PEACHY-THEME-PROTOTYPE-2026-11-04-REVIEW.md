# G1-03 — Peachy light/dark product prototype

**Date:** 2026-11-04  
**Status:** `PROTOTYPE IMPLEMENTED / BROWSER UAT NOT VERIFIED / OWNER VISUAL REVIEW PENDING`  
**Scope:** Project Home → project CSV analysis only. No app-wide theme rollout.

## What changed

- Added an accessible light/dark toggle to Project Home and the selected project CSV analysis view.
- Stores the preference in `localStorage` under `po-hub-theme-preference-v1` so it carries across the two prototype screens.
- Uses a warm Peachy dark palette. Dark overrides are scoped to the two prototype routes and cover Project Home, the CSV table, bar chart and existing warning/status colors.
- Added no demo metrics and made no data or schema changes.

## Verification

- Focused tests: `ProjectThemeToggle.test.tsx`, `ProjectHome.test.tsx`, `DataFirstWorkspace.test.tsx`: **3 files / 26 tests PASS**.
- `npm run build` (includes TypeScript): **PASS**; Vite transformed **81 modules** and retained the existing large-chunk advisory at **762.36 kB**.
- Calculated WCAG contrast ratios for the dark palette's primary text, muted text, Peachy accent, warning, positive, negative, blue insight and new-data colors; all checked pairs exceeded **7:1**.
- **Browser screenshots: NOT VERIFIED.** Local loopback remained blocked in the prior runtime attempt; no screenshots were fabricated. The open Tracking tab was not navigated. Contrast calculation and component tests do not replace running-app visual review.

## Product Acceptance

- **PO goal:** switch between readable Peachy light and dark themes while reviewing existing project data and warnings.
- **User journey:** `/research?projectId=<id>` → open CSV analysis at `/research?projectId=<id>&view=csv&action=import-csv#project-csv-data` → inspect its existing table, chart and “điểm cần xem” → switch theme; the selected theme is retained when returning between these prototype screens.
- **Automated work:** save theme preference and apply a consistent, scoped token palette to the prototype screens, chart and warning states.
- **Expected result:** existing project data and actions remain available in both themes.
- **Remaining friction:** real desktop screenshots and visual review of chart labels, warnings, keyboard focus and navigation remain pending; other routes have not been themed.
- **Verification:** 26 focused tests, build/TypeScript and contrast calculations; no browser UAT.
- **Decision:** `NEEDS FIX / PROTOTYPE IMPLEMENTED; OWNER VISUAL REVIEW PENDING`.

## Next action

On an isolated QA runtime, capture Project Home and the selected CSV analysis route at desktop size in both themes. Review text contrast, chart labels, warning states, keyboard focus and return navigation before broader implementation.

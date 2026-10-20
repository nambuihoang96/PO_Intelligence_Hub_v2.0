# PO HUB — UI-02B.0 R1 Analytics Refinement

## Delivery

- Branch: `feat/ux-recovery-01-research-results`
- Base reviewed: `5e8e7dc1f13e50b0e0a922809912f7d47636c0e6`
- Implementation commit: `1e5c4b532ddd96a1ae2f94827619200683cc2e72`
- PR: not created
- Scope: frontend analytics selection, responsive presentation, and focused tests. No backend, schema, migration, report, or CSV-import code changed.

## Changes

- Multi-entity reports with more than one period now render as an entity-by-period matrix. Each supplied observation appears in its own cell, and each cell opens that observation's evidence. Missing entity-period pairs say “No observation”; no value is filled or interpolated.
- A single entity with two reported periods remains a two-point view. A single entity with three or more periods uses a date-spaced chart; irregular intervals now occupy proportional horizontal distance and the observed dates are labeled. Its connecting line is explicitly described as not representing intermediate measurements.
- Comparability groups retain metric ID, full definition, unit, GEO, platform, granularity, and methodology. Different definitions/methodologies stay in separate views. Complete standalone observations and ranking periods without peer entities remain visible as sourced facts instead of being dropped or shown as a misleading comparison.
- The comparison matrix scrolls horizontally inside its own bounded region on tablet/mobile; the page itself does not gain horizontal overflow. Added a scroll offset so the sticky results tabs do not cover the Quantitative Evidence heading.

## Files changed

- `frontend/src/reports/quantitativeAnalytics.ts`
- `frontend/src/reports/QuantitativeEvidence.tsx`
- `frontend/src/reports/QuantitativeEvidence.test.tsx`
- `frontend/src/style.css`
- `.bangiao/UI-02B0-R1-REVIEW.md`
- `.bangiao/screenshots/ui-02b0-r1/*.png`

No backend API or contract changes were needed. No migration was added. Existing report content and SQLite databases were not changed; browser testing used a separate SQLite root under `.test-tmp`.

## Verification

- Backend: `91 passed`, one existing Starlette/AnyIO deprecation warning.
- Frontend: `65 passed` across 7 test files. Added coverage for three entities × two periods, three entities × irregular periods, missing periods, mixed metric definitions, every matrix-cell evidence action, unpaired ranking periods, and qualitative-only rendering. The full run also passed the existing CSV import regression tests.
- TypeScript: `npm run typecheck` passed.
- Production build: `npm run build` passed.
- Browser: actual app served at localhost against the isolated test database. A labeled synthetic fixture contained three game entities and six report-supplied observations over two periods; it is explicitly not market data. Clicking a matrix observation navigated to Evidence and highlighted the corresponding record.
- Responsive dimensions were set through Edge DevTools emulation and confirmed from the app document: 1440×900, 768×1024, and 390×844. At 768px and 390px, the document width equaled the viewport (no page-level horizontal overflow); the matrix remained contained and its internal scroll width was 570px (available widths 450px and 304px respectively).
- CSV UI was covered by the passing existing frontend tests; a separate browser CSV import session was not part of this refinement's UAT.

## Screenshots

All images are real screenshots from the running app, not generated mockups. The test report's observations are synthetic QA values and must not be read as research findings.

1. [Overview, 1440×900](screenshots/ui-02b0-r1/overview-1440x900.png)
2. [Quantitative Evidence, 1440×900](screenshots/ui-02b0-r1/quantitative-1440x900.png)
3. [Quantitative Evidence, 768×1024](screenshots/ui-02b0-r1/quantitative-768x1024.png)
4. [Quantitative Evidence, 390×844](screenshots/ui-02b0-r1/quantitative-390x844.png)
5. [Evidence record opened from a matrix observation, 390×844](screenshots/ui-02b0-r1/evidence-action-390x844.png)

## Limitations

- No real PO-supplied ASMR report was used for browser UAT. The synthetic isolated fixture verified rendering, period/entity retention, responsive containment, and evidence navigation only.
- The matrix intentionally requires horizontal scrolling on narrow viewports when there are several periods. It keeps entity names visible and exposes every value and evidence action through the contained scroll area.
- Research-supplied numeric values remain unverified, as before.

## Review status

**READY FOR PRODUCT OWNER REVIEW.** No merge performed. The branch is pushed for review. No follow-on dashboard work started.

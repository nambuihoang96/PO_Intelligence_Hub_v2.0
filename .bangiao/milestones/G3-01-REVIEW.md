# G3-01 — multi-metric CSV acceptance

Date: 2026-10-28. Baseline: `08603344`; branch `feat/ux-recovery-01-research-results`.

**Decision:** TECHNICAL PASS and BROWSER UAT PASS for the interactions below. PRODUCT ACCEPTANCE PENDING OWNER REVIEW.

The real Sensor Tower CSV was selected through the browser and checked against its saved dataset in isolated QA (`15295` frontend / `15296` API, `.g3-01-qa-20261028/`). Preview and saved explorer supported 1 → 2 → 9 selected metrics and removal; Downloads header cycled descending → ascending → unsorted. Decimal revenue and percentage sorting were checked against real values in both directions, with missing and invalid cells after valid values. Keyboard Enter worked; desktop product identity stayed visible during horizontal scrolling. Desktop 1440×900 and mobile 390×844 had no page overflow.

Fixes: empty CSV values no longer inherit the invalid label from missing scope warnings; malformed numeric source text is not treated as a valid number in preview sorting; mobile preview preserves room to read the first metric and desktop preview keeps the product name sticky. The original CSV SHA-256 and saved dataset hash both remained `38a7e9844c09857269ffcc849937f8059918bc0e313be55c18571d894f3e2be0` after interaction. Missing GEO and unconfirmed period remain explicit; 0/243 observations are analysis-ready.

Verification after fixes: 26 frontend test files / 219 tests PASS, typecheck PASS, production build PASS (existing >500 kB bundle warning). The UI UX Pro Max skill was loaded and its table accessibility/responsive search applied. Backend test suite was not rerun; the QA API was exercised live. No production SQLite writes.

Browser evidence: [preview desktop](../screenshots/g3-01/preview-nine-desktop.jpg), [preview mobile](../screenshots/g3-01/preview-nine-mobile.jpg), [saved desktop](../screenshots/g3-01/multimetric-desktop-1440.jpg), [saved mobile](../screenshots/g3-01/multimetric-mobile-390.jpg).

## Product Acceptance

- **PO goal:** Explore provider values and choose products without losing source context.
- **Journey:** Choose CSV → choose metrics → sort → inspect saved products → open a profile or comparison.
- **Automated work:** Detect metrics, preserve source values, display missing/invalid values, sort and warn about incomplete scope.
- **Expected result:** Selected columns and sorting reflect the file without invented comparisons.
- **Remaining friction:** Nine columns require horizontal scrolling in preview; mobile saved products are vertically long. This file does not establish GEO or the meaning of its dates.
- **Verification:** Tests and browser scenarios listed above; independent product owner review is pending.
- **Decision:** `TECHNICAL PASS`, not `PRODUCT PASS`.

Changed code: `QuantitativeDatasetImport.tsx`, `csvTableInteraction.ts` and its tests, `DataFirstWorkspace.tsx` and its tests, `style.css`; evidence and Recovery Board updated. Commit: see task branch history containing this handoff.

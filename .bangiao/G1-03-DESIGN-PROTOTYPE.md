# G1-03 — Peachy Studio Design Prototype

**Date:** 2026-10-27
**Branch:** `feat/ux-recovery-01-research-results`
**State:** `READY_FOR_OWNER` — the isolated prototype is available in the Codex in-app browser for visual review; owner acceptance is pending.

## Scope

This is an isolated design prototype for the approved Peachy Studio direction. It does not modify the running Research Results UI, shared application styles, backend, database, reports, benchmark selections, PO notes, or navigation. Placeholder labels are explicitly identified as non-report data.

Prototype files:

- `frontend/prototypes/g1-03/index.html`
- `frontend/prototypes/g1-03/tokens.css`

## Design decisions in this prototype

- Semantic light-theme tokens: warm canvas, white surfaces, deep ink, muted text, restrained blue navigation, peach accents, and semantic status colors.
- Reusable visual primitives: compact report header, conclusion, takeaways, finding cards, snapshot, gaps, and PO decision panel.
- Responsive breakpoints at 1120px, 980px, 760px, and 520px; at constrained widths the secondary rail moves below Findings, findings use one column when necessary, and mobile stacks the rail.
- Keyboard-visible focus, semantic headings/nav, reduced-motion handling, and SVG icons.
- No external font, API, research content, fake metrics, or persistence behavior.

Selected text/background contrast checks (calculated from token values):

| Pair | Contrast |
|---|---:|
| Ink `#263248` / canvas `#FFF9F5` | 12.33:1 |
| Muted ink `#596579` / canvas `#FFF9F5` | 5.65:1 |
| Navigation `#315DBB` / soft blue `#EEF4FF` | 5.57:1 |
| Accent `#B84A2F` / peach `#FFF0E8` | 4.65:1 |
| Success `#256B50` / soft green `#EDF7F0` | 5.81:1 |
| White / primary decision button `#1F5C4C` | 7.80:1 |

These are selected text-color pairs, not a complete automated accessibility audit.

## Verification

- `npm run build`: **PASS** — TypeScript and Vite production build passed. Existing large-chunk advisory remains (546.55 kB JS).
- `npm test` under the restricted run: **FAILED before test execution** — 21 suites failed while Vite/Vitest tried to rename temporary cache files (`EPERM`). No test assertions ran in that attempt.
- `npm test` with normal temp-cache access: **PASS** — 21 test files, 179 tests passed (2026-10-27). This is the authoritative frontend test result for the current branch.
- Single-thread retry under the restricted run: **NOT VERIFIED** — no test output appeared; stopped after repeated wait.
- CSS/PostCSS parse after responsive refinement: **PASS**.
- Browser preview: **PASS** — served over HTTP at `http://127.0.0.1:15190/prototypes/g1-03/` and opened in the Codex in-app browser. HTTP response was 200. The static prototype has no backend or database connection.
- Real browser viewport checks: **PASS** for 1440×900, 1024×828, 768×900 and 390×844. At 1024px, the first browser review exposed cramped two-column findings beside the rail; a `max-width:1120px` breakpoint moved the rail below Findings. Recheck showed 338px-wide cards in a 724px findings container, with no horizontal page overflow. At 768px and 390px, document widths were 753px and 375px respectively, matching browser viewport widths without horizontal overflow.
- Keyboard interaction: **PASS** — focused “Read full summary” and activated with Enter; disclosure expanded and focus remained visible.
- Screenshots: Actual browser captures were reviewed inline in the Codex session for desktop and responsive widths. They are **not saved as repository image files** because the browser tool exposed no documented screenshot-export operation; no fabricated screenshot artifact is claimed.
- Backend tests: not run; backend and product code were not changed.
- Production SQLite: untouched.

## Product Acceptance

- **PO goal:** Review a cohesive visual language and reusable report primitives before a cross-screen style rollout.
- **User journey:** Open the standalone prototype → review report header, conclusion, findings, evidence status, unknowns, and PO decision at desktop/mobile widths → provide design feedback.
- **Automated work:** The preview defines semantic tokens, reusable visual patterns, responsive rules, and focus behavior.
- **Expected result:** A visual direction candidate is available without changing saved research or the current app.
- **Remaining friction:** This is a visual direction prototype only; its labels are placeholders, it does not render a saved report, and shared application screens remain unchanged. The owner must review the direction before rollout.
- **Verification:** Production build, 21 frontend test files / 179 tests, CSS parse, HTTP preview, browser checks at four widths, and keyboard disclosure interaction passed. No product-data persistence UAT applies to the standalone prototype.
- **Decision:** `READY_FOR_OWNER`; technical prototype checks pass. Product acceptance and owner acceptance remain pending.

## Next step

Review the running Codex browser preview at `http://127.0.0.1:15190/prototypes/g1-03/`. Only after that review should the tokens be applied to shared application screens.

**Implementation commit:** `80c16ec2903f057d5b0e0091e1b98a592de480ee` (pushed to the existing review branch; no merge).

## Feedback / rework history

### Round 1 — 2026-10-27 — Resolve browser preview blocker

- **Original owner feedback:** “Tự tháo gỡ cái blocker đấy đi chứ?”
- **Classification:** Verification workflow unblock with bounded responsive UX refinement.
- **Affected task:** G1-03 only. Cross-screen rollout remains gated on owner review; no unrelated task or product data was changed.
- **Impact:** The previous local preview attempt could not be reached by the Codex in-app browser. A local HTTP preview on port 15190 was started with the required socket permission. Browser review at 1024px also exposed a cramped findings layout, so the isolated prototype breakpoint was adjusted to move the secondary rail beneath findings at widths up to 1120px.
- **Updated acceptance:** Open the actual prototype in Codex browser; inspect desktop/tablet/mobile widths; verify no horizontal overflow, readable finding cards and keyboard-accessible summary disclosure; report screenshot evidence honestly without claiming saved image files.
- **Implementation reference:** `frontend/prototypes/g1-03/tokens.css`; live preview `http://127.0.0.1:15190/prototypes/g1-03/`.
- **Review evidence:** HTTP 200; 1440×900, 1024×828, 768×900, and 390×844 inspected; 1024px finding cards rechecked at 338px each after layout change; no horizontal overflow; Enter activated the summary disclosure. Actual captures were visible inline in Codex, not exported to files.
- **Current status:** `READY_FOR_OWNER`. The static preview is live for review. No owner acceptance or application rollout is implied.

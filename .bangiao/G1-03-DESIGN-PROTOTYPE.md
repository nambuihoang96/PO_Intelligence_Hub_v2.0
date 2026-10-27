# G1-03 — Peachy Studio Design Prototype

**Date:** 2026-10-27
**Branch:** `feat/ux-recovery-01-research-results`
**State:** `BLOCKED` — prototype source is ready; real browser preview and owner visual review are not verified.

## Scope

This is an isolated design prototype for the approved Peachy Studio direction. It does not modify the running Research Results UI, shared application styles, backend, database, reports, benchmark selections, PO notes, or navigation. Placeholder labels are explicitly identified as non-report data.

Prototype files:

- `frontend/prototypes/g1-03/index.html`
- `frontend/prototypes/g1-03/tokens.css`

## Design decisions in this prototype

- Semantic light-theme tokens: warm canvas, white surfaces, deep ink, muted text, restrained blue navigation, peach accents, and semantic status colors.
- Reusable visual primitives: compact report header, conclusion, takeaways, finding cards, snapshot, gaps, and PO decision panel.
- Responsive breakpoints at 980px, 760px, and 520px; findings switch to one column when constrained; mobile stacks the secondary rail.
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
- `npm test`: **FAILED before test execution** — 21 suites failed while Vite/Vitest tried to rename temporary cache files (`EPERM`). No test assertions ran.
- Single-thread retry: **NOT VERIFIED** — no test output appeared; stopped after repeated wait.
- Browser preview: **NOT VERIFIED** — Codex in-app browser timed out connecting to `http://127.0.0.1:15190/prototypes/g1-03/`; browser security policy rejected the local `file://` URL. The temporary Vite process was stopped. No alternate browser, CDP, or Windows UI route was used.
- Screenshots: **None** — no running-browser screenshot was captured; no screenshot is represented as real evidence.
- Backend tests: not run; backend and product code were not changed.
- Production SQLite: untouched.

## Product Acceptance

- **PO goal:** Review a cohesive visual language and reusable report primitives before a cross-screen style rollout.
- **User journey:** Open the standalone prototype → review report header, conclusion, findings, evidence status, unknowns, and PO decision at desktop/mobile widths → provide design feedback.
- **Automated work:** The preview defines semantic tokens, reusable visual patterns, responsive rules, and focus behavior.
- **Expected result:** A visual direction candidate is available without changing saved research or the current app.
- **Remaining friction:** The Codex browser cannot currently render this local prototype; there is no browser screenshot or direct visual verification. The current app remains unchanged.
- **Verification:** Production build passed; full tests were blocked before assertions by temp-file permission errors. Browser UAT is `NOT VERIFIED`.
- **Decision:** `NEEDS FIX` for the preview/review gate; no `PRODUCT PASS` or owner acceptance is claimed.

## Next step

Restore a supported in-Codex local browser preview path, then capture actual screenshots and request PO visual review. Only after that review should the tokens be applied to shared application screens.

**Implementation commit:** pending.

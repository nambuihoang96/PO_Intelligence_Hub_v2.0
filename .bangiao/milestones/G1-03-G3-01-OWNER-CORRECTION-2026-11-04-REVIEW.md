# Owner correction: research-again, CSV labels and Codex timeout

Date: 2026-11-04. Status: **NEEDS FIX — original runtime timeout cause unresolved**.

## Changed files

- `frontend/src/reports/ResearchIntake.tsx`: selected model/readiness in the existing settings summary, one-click access to the unique selector, visible gated run button.
- `frontend/src/research/projectThemePrototype.css`: removed CSV prototype geometry overrides; use Peachy layout/card/spacing rules, adjusting type/line-height and dark colors only. Added intake settings/scope contrast.
- `frontend/src/research/CsvAutoAnalysis.tsx`: label deterministic output “Quan sát từ chênh lệch đã tính”; retain exact rules and source rows.
- `backend/app/codex_research.py` and `frontend/src/reports/api.ts`: safe request reference, stage/elapsed/deadline logging and allowlisted event metadata on timeout; show reference in retained-input error. No timeout extension or automatic retry.
- Focused regressions: `frontend/src/reports/ResearchIntake.test.tsx`, `tests/test_codex_research.py`.
- `docs/RECOVERY_BOARD.md`: round 12 supersedes previous visual redesign assumptions while preserving history.

## Timeout evidence and limits

Launcher points at `logs/backend.stdout.log` and `logs/backend.stderr.log`; both and the frontend logs were empty at inspection. Code confirms a 240-second CLI deadline and 270-second browser limit. Logs do not establish why the owner's CLI request failed to finish. No model/network/quota cause is claimed.

New diagnostics log a random reference, stage, model, elapsed/deadline, prompt character count, return code, output byte counts, allowlisted event types and a coarse stderr keyword category. They do not log prompt/output/stderr text, credentials or paths. Updated backend must be loaded before these diagnostics apply. No real CLI inference was run.

## Verification

- ResearchIntake + CsvAutoAnalysis: **65/65 frontend tests PASS**.
- Codex backend: **7/7 mocked tests PASS**. Restricted Windows execution blocked in Python's socketpair during event-loop creation; exact tests passed with approved local execution outside that restriction. This does not diagnose the owner's runtime failure.
- TypeScript/Vite build: **PASS**, 81 modules; existing 765.31 kB JS advisory.
- Targeted IAB research-again route at `127.0.0.1:5173`, using existing Puzzle report: model/status visible, one click exposes existing model options; exactly one model selector and one shared theme switch. Dark settings/prompt/scope screenshot inspected. No run/save/model preference change. Image not saved to repository.
- No full suite, model inference, merge or release.

## Product Acceptance

- **PO goal:** choose the intended model where research runs and retry retained input with a traceable error.
- **User journey:** existing research-again screen → see model/readiness → open settings once → select model → run/review/save or retry. Running inference was excluded from this task.
- **Automated work:** readiness gating, deterministic CSV wording and safe request diagnostics.
- **Expected result:** discoverable controls and readable existing Peachy layout; failed requests retain input and expose a diagnostic reference.
- **Remaining friction:** original timeout cause is unknown; updated diagnostics have not been used by a real inference; owner visual acceptance is pending.
- **Verification:** focused mocked tests, build and targeted browser check above.
- **Decision:** **NEEDS FIX / RUNTIME CAUSE UNRESOLVED**. No Product Pass.

## Follow-up: generic CSV recommendation removed

2026-11-04: removed both rule-written “Việc tiếp theo” blocks from single-file and period comparison. Preserved source-backed numbers, old→new values, rules, scope and direct source-row navigation. CSV focused tests **6/6 PASS** and TypeScript/Vite build **PASS**. No new design, real Codex request or browser verification in this cleanup. This specific issue is resolved; the original 240-second runtime timeout cause remains unknown, so overall NEEDS FIX still applies.

## Follow-up: dark CSV picker surfaces

2026-11-04: fixed white old/current picker and pale mode-tab surfaces using dark-only CSS color rules. No geometry or light-theme rules changed. Existing theme/CSV tests **7/7 PASS**, build **PASS**. Actual IAB dark/light screenshots and computed geometry confirm dark surfaces/readable text with unchanged Peachy grid/padding/gap/radii and light colors. Dark preference restored. Specific contrast defect resolved; original Codex timeout cause remains unknown.

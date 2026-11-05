# G1-03 — V4 desktop entry and launcher review, round 6

**Date:** 2026-11-04  
**Status:** `TECHNICAL PASS / BROWSER UAT NOT VERIFIED / OWNER ACCEPTANCE PENDING`  
**Scope:** Project-root launcher, project-list discoverability and Codex timeout feedback. No release or merge.

## What changed

- Confirmed the V4 Project Overview is implemented in the React app at `frontend/src/research/ProjectHome.tsx`; the standalone HTML wireframe remains a disconnected preview and is not used as the application entry.
- Root `run.bat` follows `run-local.bat` → `run-local.ps1`, then opens `http://127.0.0.1:5173/research`.
- The project list explains that selecting a project opens its Project Overview, and each project row labels that action.
- Frontend compatibility now checks for the V4 `ProjectHome` marker before reusing an existing app. An unconfirmed/older page is left untouched and the launcher gives a short instruction.
- Codex progress states the four-minute cap and no-auto-retry behavior. A backend 504 explains that the question remains and that no specific runtime cause was recorded.

## Verification

- `scripts/test-launcher-compatibility.ps1`: **24 assertions PASS**.
- `frontend/src/reports/ResearchIntake.test.tsx` + `frontend/src/research/ProjectHome.test.tsx`: **2 files / 66 tests PASS**, including the mocked 504 single-request/question-retention case.
- `tests.test_codex_research`: **5/5 PASS**.
- `npm run build` (includes TypeScript): **PASS**. Vite emitted the existing large-chunk advisory at **761.60 kB**.
- Local QA startup was attempted only with the pre-existing QA data root. The agent environment denied loopback socket access while starting the QA API on port 8001. A separate tab at the ambient app origin `http://127.0.0.1:15330/research` returned `ERR_CONNECTION_REFUSED`; the open owner tab was not navigated. No alternate browser port was tried after that.
- Root `run.bat` was not executed because its standard startup applies database migrations and no isolated copy of the launcher workspace was available. No screenshot or browser UAT is claimed. No database migration or real Codex request/quota was used.

## Timeout evidence

The backend sets `RESEARCH_TIMEOUT_SECONDS = 240`, waits for CLI completion, then kills the child and returns HTTP 504. The frontend request deadline is 270 seconds, so the expected backend timeout should normally reach the UI first. Current logs contain no request-specific elapsed time, CLI stderr, selected model or process outcome. Therefore, the 240-second cap is the confirmed timeout mechanism; the underlying reason the reported Codex run did not return is **not verified**. No timeout was extended.

## Product Acceptance

- **PO goal:** Start the real app from one launcher and understand how to reach the integrated V4 project screen; retain the Codex question after a timeout.
- **User journey:** Double-click project-root `run.bat` → `http://127.0.0.1:5173/research` → select a project card → see its Project Overview at `/research?projectId=<selected-project>`; for Codex, enter once, wait, and manually retry with the question still present if needed.
- **Automated work:** Open the current app, guard against an incompatible stale frontend without killing unknown processes, explain the V4 project-card action, preserve the question and avoid automatic resend.
- **Expected result:** Integrated React Project Overview and clear timeout feedback.
- **Remaining friction:** The real run.bat-to-browser path and exact project-specific URL are not verified in this environment; timeout runtime cause and actual CLI response remain unknown.
- **Verification:** Automated checks above. No live browser screenshot, launcher UAT or real inference was performed.
- **Decision:** `NEEDS FIX FOR FULL PRODUCT ACCEPTANCE`; technical changes pass, live browser/runtime proof is still required.

## Next action

On an isolated QA launcher copy, capture the actual root `run.bat` → project list → selected V4 Project Overview URL. Separately, use at most one lightweight Codex request after the runtime is safely available; preserve the question and record concrete CLI diagnostics if it times out.

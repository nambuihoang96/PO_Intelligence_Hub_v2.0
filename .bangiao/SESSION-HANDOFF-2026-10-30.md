# PO Hub — Session Handoff (30 Oct 2026)

## Repository and current worktree

- Existing GitHub repository: `nambuihoang96/PO_Intelligence_Hub_v2.0` (`origin` is already configured; no duplicate repository was created).
- Current task worktree: `C:\Users\Admin\.codex\worktrees\research-auto-presentation-qa\PO_Intelligence_Hub_v2.0`
- Active branch: `feat/research-auto-presentation-v1`
- Base before this handoff task: `a6faa1012dc9394b8e6cd9292e08e40c0a174bdd` (`fix(research): localize entity type labels`).
- Primary checkout is a separate worktree at `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0`; its HEAD was `f108d010148fc6d6c8650f1cbce254e55c3e39d8` when inspected. This task does not change that checkout.

## User changes to preserve

These were already changed before this cleanup task and must not be reverted or included in a scoped commit:

- `docs/RECOVERY_BOARD.md`
- `frontend/src/research/ResearchWorkspace.tsx`
- `frontend/src/style.css`
- `.bangiao/RESEARCH-CORE-V1-ACCEPTANCE-REVIEW.md`
- `.bangiao/screenshots/research-core-v1-acceptance/`

The genuine report inputs and saved QA evidence under `.auto-presentation-qa/` are local-only and are intentionally excluded from Git. They remain available in this worktree.

## Product status at handoff

- Research Core v1 technical workflow: `READY_FOR_OWNER`, not Product Accepted.
- G1-01/G1-03: `READY_FOR_OWNER`; Product Owner visual review still pending.
- G3-07: not started. G4-01 remains blocked; G4-02/G4-03 not started.
- Latest Research Core blocker closure and test evidence: `.bangiao/RESEARCH-CORE-V1-BLOCKER-CLOSURE.md`.
- Latest read-only owner review: `.bangiao/RESEARCH-CORE-V1-ACCEPTANCE-REVIEW.md` and `.bangiao/screenshots/research-core-v1-acceptance/`.

## Launcher behavior

Run `run.bat` from this exact worktree to launch this branch's files. The launcher prints its workspace, branch, commit and source fingerprint, opens `http://127.0.0.1:5173`, and uses the matching backend on `http://127.0.0.1:8000`. It only restarts a service when this worktree's launcher can prove it owns that exact process and its source fingerprint is stale. An unknown process is left running and reported with PID instructions.

The `D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0\run.bat` belongs to a separate worktree and will not automatically switch to this feature branch. To run this branch, use the `run.bat` at the current worktree path above. No production SQLite database was changed.

## Cleanup record

- Disposable test clone and temporary browser profile: removed from `.auto-presentation-qa/research-core-v1-copy/` after verifying the QA snapshot had already been restored and the run screenshots were retained elsewhere.
- Frontend test scratch cache: removed from `frontend/.auto-presentation-qa/`.
- Unused QA Chrome profile: confirmed no Chrome process referenced it, then removed `.auto-presentation-qa/chrome-core-audit/` (180.4 MB).
- Genuine report input, QA database/data, original capture scripts and cited design/reference screenshots are retained locally.
- Root `.auto-presentation-qa/` and frontend scratch directory are ignored to keep local-only QA content out of Git.
- Git reported about 34.6 MB of stale/incomplete objects in the shared multi-worktree object store. Automatic-review rejected pruning because it could irreversibly delete unreachable work from another worktree. Those Git internals were left untouched.
- Windows denied process-command-line inspection for the retained Chrome profile, so that profile was not deleted. This is an unresolved safe-cleanup item, not assumed junk.

## Verification from this handoff task

- PowerShell parsing: `run-local.ps1`, launcher compatibility functions and the focused test script passed.
- Focused launcher tests: 19 assertions passed, retaining the prior OpenAPI compatibility cases and covering PID/start-time/workspace ownership, stale source, database-root mismatch, old records without fingerprints, and absolute/relative QA paths.
- Actual `run.bat` host smoke: PASS on a new isolated SQLite database. Migrations reached `20261027_0015`; `/health` returned `ok`; frontend and its `main.tsx` returned HTTP 200; `/api/v1/reports` through Vite proxy returned HTTP 200. The launcher printed the expected branch, commit and source fingerprint. QA services were stopped and their temporary database/records removed.
- The same launch attempted inside the Codex restricted environment failed its localhost self-check with Windows socket permission denied. A minimal HTTP server could bind there, but host/sandbox clients could not reach it. Running the exact `run.bat` on the Windows host resolved this and passed. The normal `run.bat` still opens the browser; a temporary QA-only environment switch suppressed it during the smoke test.
- No page-by-page browser UAT was run for this launcher cleanup task.

## Next session

1. Read `AGENTS.md` and `docs/RECOVERY_BOARD.md` first; preserve the user changes listed above.
2. Run `scripts/test-launcher-compatibility.ps1`, then frontend tests/build and check `run.bat` from this worktree.
3. Continue only approved P0 work; do not reopen completed migrations or redesign, and do not merge/deploy or touch production SQLite.

# Decisions & Tracking P0 — Owner Handoff (2026-11-01)

## Scope delivered on this branch
Base: `feat/research-auto-presentation-v1` @ `2854096d9d184fb3588b2571c31b80c25fb786e4`.
Branch: `fix/decisions-tracking-p0-20261101`.
This branch was built from the published feature branch, **not the live Windows worktree**.

- Project Home: prominent Decisions area; distinguish automatic candidates from explicitly saved decisions; deep-links for both, direct Tracking entry.
- Report Overview + Finding: direct project-decision links, contextual report/finding identifiers; report-local notes remain separate from project decisions.
- OpportunityReview: accurate candidate/saved labels and filters; review date correctly identified as the date to review, not assessment date.
- Tracking: saved decisions only, ordered by review date, due/overdue indicator, next action and report-source link.
- Frontend regression tests added for candidate/decision distinction and due-date tracking.
- Responsive CSS for desktop and mobile.

## Honest limitations
- **No autonomous monitoring.** There is no scheduled internet retrieval, change detection or automatic alerts.
- Report-provided recommendations are not an independent AI verification or an approved PO decision.
- This environment did **not** execute npm, backend pytest, or a real Windows Browser UAT. Do not claim test PASS or Product PASS.
- No production SQLite reads, writes or migrations; no master merge or deployment.
- The user's live local folder may contain changes not committed/pushed. Reconcile before integration.

## Safe isolated Windows test (does not switch the owner's current working tree)

In PowerShell (using the existing local repository):
```powershell
Set-Location 'D:\AI\PO Analysis\PO_Intelligence_Hub_v2.0'
git status --short
git fetch origin fix/decisions-tracking-p0-20261101
git worktree add '..\PO_HUB_P0_UAT' 'origin/fix/decisions-tracking-p0-20261101'
Set-Location '..\PO_HUB_P0_UAT'
.\scripts\setup.ps1
Set-Location .\frontend
npm test -- --run --maxWorkers=1 --testTimeout=15000
npm run typecheck
npm run build
Set-Location ..
```

For Browser UAT, use an **isolated** `APP_DATA_ROOT` with fresh/fixture data instead of the production SQLite. Launch with `.\run-local.bat` only after confirming the launcher honors the isolated data root. Open the app and exercise all paths; capture screenshots at 1440x900 and 390x844. Do not modify production data.

## Manual acceptance checklist

1. Project Home has a Decisions section visible without tab-hunting.
2. A 17-candidate project shows the candidate total, not 17 approved decisions; the saved-decision total is separate.
3. Report Overview > specific Finding > "Đưa vào quyết định PO" opens the exact finding (correct report ID/hash/item key).
4. Save a PO decision, refresh, reopen that candidate. Status, priority, rationale, evidence links, next action and review date persist.
5. Tracking lists only explicitly saved decisions, due dates and exact source report. No fabricated auto-alerts.
6. Changes to a report-local note alone do not silently create a project decision.
7. Desktop/mobile UI has readable layout, usable actions, no page-wide horizontal overflow.
8. Run frontend tests/typecheck/build and backend tests; **record the observed outputs**.
9. Inspect production/local git status before merging/rebasing/cherry-picking; never discard local edits.

## Integration rule
Do **not** merge this branch to master or overwrite the existing local worktree automatically. First pass tests and Browser UAT in isolated worktree. Then have Codex reconcile only these P0 changes into the owner's newest local branch and rerun checks. Explicit owner approval before merge/deploy.

## Current acceptance
CODE COMMITTED ON ISOLATED GITHUB BRANCH; TEST / BROWSER UAT / PRODUCT OWNER ACCEPTANCE: NOT VERIFIED.

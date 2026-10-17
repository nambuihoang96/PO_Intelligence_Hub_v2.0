# PO Intelligence Hub V2

Local-first application scaffold for PO Intelligence Hub V2. The current delivery includes the **V2-001 application shell** and **V2-002 local SQLite metadata schema**. Research behavior, AI, and source integrations are not implemented.

## Requirements

- Windows 10/11
- Python 3.12+
- Node.js 22+

## Configure data storage

The backend reads `APP_DATA_ROOT`. If unset, it resolves to `<workspace>\data` beside this README. Copy `.env.example` to `.env` to use the shown D: location or set a different local path. The application does not set a global Windows environment variable. Keep `.env` local; it is ignored by Git.

## Install dependencies

Run these commands from the workspace root in PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\scripts\setup.ps1
```

The setup script creates a project-local Python virtual environment and installs the pinned backend and frontend dependencies from `backend/requirements.lock` and `frontend/package-lock.json`.

## Run in development

```powershell
.\scripts\dev.ps1
```

The API listens on `http://127.0.0.1:8000` and the UI on `http://127.0.0.1:5173`. Open the UI in a browser. The API health check is `http://127.0.0.1:8000/health` and returns `{"status":"ok"}`.

## Initialize the local database

V2-002 adds versioned SQLite migrations. Apply the schema after installing dependencies:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

The database file is stored as `po_intelligence_hub.sqlite3` under `APP_DATA_ROOT` (default `<workspace>\data`). The initial schema creates metadata tables only; no research behavior or source connections are included.

## Research API contracts

The API exposes typed JSON contracts under `/api/v1`. OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

- `POST /api/v1/projects`, `GET /api/v1/projects?cursor=&limit=`, `GET/PATCH/DELETE /api/v1/projects/{project_id}`
- `POST /api/v1/projects/{project_id}/plans` creates the next immutable plan version; `PUT /api/v1/projects/{project_id}/plans/{version}` edits the latest version by appending a new one. `GET /api/v1/projects/{project_id}/plans`, `GET /api/v1/projects/{project_id}/plans/latest`, and `GET /api/v1/projects/{project_id}/plans/{version}` read versions. A version can be deleted only before a run references it.
- `POST /api/v1/projects/{project_id}/runs` starts a queued run for an explicitly selected `plan_version`; `GET /api/v1/projects/{project_id}/runs` lists project runs and `GET /api/v1/runs/{run_id}` reads run status. A run can be deleted only while queued; state updates follow the run lifecycle.
- `PATCH /api/v1/runs/{run_id}/state` applies an allowed session-state transition. This records lifecycle metadata only and does not execute research.

List responses include `items`, `next_cursor`, and `limit`. Request validation and API errors use `{ "error": { "code", "message", "details", "retryable" } }`. Plans remain versioned and read-only after creation; editing creates a new version so existing runs continue to point to their original plan version.

## Run smoke checks

```powershell
.\scripts\test.ps1
```

The checks cover the `/health` response, default data-root location, and frontend TypeScript production build. No external APIs are called at runtime.

## UI status

The navigation is a placeholder for future sections and clearly labels them `Coming later`. The current shell reports `Data chưa kết nối`.

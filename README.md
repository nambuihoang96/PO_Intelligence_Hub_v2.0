# PO Intelligence Hub V2

Local-first application for PO Intelligence Hub V2. Current delivery includes the **V2-001 application shell**, **V2-002 local SQLite metadata schema**, **V2-003 typed research API**, **V2-004 information architecture**, **V2-005 project setup and versioned plan editor**, **V2-006 manual source registry**, **V2-007 immutable run manifests**, and **V2-008 app listing registry and Explorer**. Automated research, AI, scraping, and source integrations are not implemented.

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

After dependencies are installed, start both services with the single Windows launcher:

```powershell
.\run-local.bat
```

Alternatively, run `.\run-local.ps1` from PowerShell. The launcher applies database migrations, starts the API and frontend together, waits for the API health check, and stops the API when you exit the frontend with Ctrl+C. Backend logs are written under `logs\`. If the project environment uses a different compatible Python interpreter, pass it with `-PythonExecutable`; required packages must be installed for that interpreter.

The API listens on `http://127.0.0.1:8000` and the UI on `http://127.0.0.1:5173`. Open the UI in a browser. The API health check is `http://127.0.0.1:8000/health` and returns `{"status":"ok"}`.

## Initialize the local database

V2-002 adds versioned SQLite migrations. Apply the schema after installing dependencies:

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

The database file is stored as `po_intelligence_hub.sqlite3` under `APP_DATA_ROOT` (default `<workspace>\data`). The launcher applies the current migrations automatically; you can also apply them manually with the command above.

## Research API contracts

The API exposes typed JSON contracts under `/api/v1`. OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

- `POST /api/v1/projects`, `GET /api/v1/projects?cursor=&limit=`, `GET/PATCH/DELETE /api/v1/projects/{project_id}`
- `POST /api/v1/projects/{project_id}/plans` creates the next immutable plan version; `PUT /api/v1/projects/{project_id}/plans/{version}` edits the latest version by appending a new one. `GET /api/v1/projects/{project_id}/plans`, `GET /api/v1/projects/{project_id}/plans/latest`, and `GET /api/v1/projects/{project_id}/plans/{version}` read versions. A version can be deleted only before a run references it.
- `POST /api/v1/projects/{project_id}/runs` starts a queued run for an explicitly selected `plan_version`; `GET /api/v1/projects/{project_id}/runs` lists project runs and `GET /api/v1/runs/{run_id}` reads run status. A run can be deleted only while queued; state updates follow the run lifecycle.
- `PATCH /api/v1/runs/{run_id}/state` applies an allowed session-state transition. This records lifecycle metadata only and does not execute research.
- `POST /api/v1/apps` registers user-provided store listing metadata; `GET /api/v1/apps?cursor=&limit=&platform=&geo=&keyword=` provides filtered cursor pagination; `GET /api/v1/apps/{listing_id}` reads one store-specific listing. iOS/Android listings and country scopes remain separate; matching names are never automatically grouped.
- `POST /api/v1/sources`, `GET /api/v1/sources?cursor=&limit=`, and `PATCH /api/v1/sources/{source_id}` manage manual source metadata; run evidence endpoints store user-provided notes and references without fetching URLs.

List responses include `items`, `next_cursor`, and `limit`. Request validation and API errors use `{ "error": { "code", "message", "details", "retryable" } }`. Plans remain versioned and read-only after creation; editing creates a new version so existing runs continue to point to their original plan version.

## Run smoke checks

```powershell
.\scripts\test.ps1
```

The checks cover the `/health` response, default data-root location, and frontend TypeScript production build. No external APIs are called at runtime.

## UI status

The Research workspace supports project setup and creating or editing versioned research plans. An edit appends a new version; older versions remain available and read-only. Primary and comparison periods are optional, and source preferences are recorded without connecting to or collecting from those sources. Explorer supports manually registered store listing metadata with OS/GEO filters and cursor pagination; URLs are stored as references and are never fetched. Listing data is user-provided, with no fixture or market data seeded into the workspace.

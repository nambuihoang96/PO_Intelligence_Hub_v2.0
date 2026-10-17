# PO Intelligence Hub V2

Local-first application scaffold for PO Intelligence Hub V2. The current delivery is **V2-001 only**: a React + TypeScript + Vite shell, a FastAPI health endpoint, and local data-root configuration. Research, AI, database, and source integrations are not implemented.

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

The setup script creates a project-local Python virtual environment and installs the pinned backend and frontend dependencies. Direct dependency versions are exact-pinned in the manifests.

## Run in development

```powershell
.\scripts\dev.ps1
```

The API listens on `http://127.0.0.1:8000` and the UI on `http://127.0.0.1:5173`. Open the UI in a browser. The API health check is `http://127.0.0.1:8000/health` and returns `{"status":"ok"}`.

## Run smoke checks

```powershell
.\scripts\test.ps1
```

The checks cover the `/health` response, default data-root location, and frontend TypeScript production build. No external APIs are called at runtime.

## UI status

The navigation is a placeholder for future sections and clearly labels them `Coming later`. The current shell reports `Data chưa kết nối`.

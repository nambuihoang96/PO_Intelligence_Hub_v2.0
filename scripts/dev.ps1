$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $workspace '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) { throw 'Dependencies are missing. Run scripts\setup.ps1 first.' }
$backend = Start-Process -FilePath $venvPython -ArgumentList @('-m','uvicorn','backend.app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $workspace -PassThru -WindowStyle Hidden
try {
    Push-Location (Join-Path $workspace 'frontend')
    try { npm run dev } finally { Pop-Location }
} finally {
    if (-not $backend.HasExited) { Stop-Process -Id $backend.Id }
}

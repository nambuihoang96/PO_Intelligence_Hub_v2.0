param([string]$PythonExecutable)

$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$venvPython = if ([string]::IsNullOrWhiteSpace($PythonExecutable)) {
    Join-Path $workspace '.venv\Scripts\python.exe'
} else {
    (Resolve-Path -LiteralPath $PythonExecutable).Path
}
$frontendPath = Join-Path $workspace 'frontend'
$npm = Get-Command npm -ErrorAction SilentlyContinue

if (-not (Test-Path $venvPython)) { throw 'Python dependencies are missing. Run scripts\setup.ps1 once first.' }
if (-not (Test-Path (Join-Path $frontendPath 'node_modules'))) { throw 'Frontend dependencies are missing. Run scripts\setup.ps1 once first.' }
if (-not $npm) { throw 'Node.js/npm was not found. Install Node.js 22+, then rerun scripts\setup.ps1.' }
$backendImports = 'import fastapi, pydantic, sqlalchemy, alembic, uvicorn; import sys; print(f"Python {sys.version_info[0]}.{sys.version_info[1]}")'
& $venvPython -c $backendImports
if ($LASTEXITCODE -ne 0) {
    throw 'Backend dependencies cannot be imported by this Python interpreter. Run scripts\setup.ps1 to recreate the project environment with a compatible Python 3.12+.'
}

foreach ($port in @(8000, 5173)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use. Stop the existing process, then run this launcher again."
    }
}

Push-Location $workspace
try {
    & $venvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed; see the output above.' }
} finally { Pop-Location }

$logsPath = Join-Path $workspace 'logs'
New-Item -ItemType Directory -Force -Path $logsPath | Out-Null
$stdoutLog = Join-Path $logsPath 'backend.stdout.log'
$stderrLog = Join-Path $logsPath 'backend.stderr.log'
$backend = Start-Process `
    -FilePath $venvPython `
    -ArgumentList @('-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000') `
    -WorkingDirectory $workspace `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

try {
    $backendReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $backend.Refresh()
        if ($backend.HasExited) { throw "Backend stopped during startup. See $stderrLog" }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
            if ($health.status -eq 'ok') { $backendReady = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $backendReady) { throw "Backend health check timed out. See $stderrLog" }

    Write-Host 'PO Intelligence Hub V2 is running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Backend:  http://127.0.0.1:8000'
    Write-Host 'API docs: http://127.0.0.1:8000/docs'
    Write-Host 'Press Ctrl+C to stop the frontend and backend.'
    Push-Location $frontendPath
    try { & $npm.Source run dev } finally { Pop-Location }
} finally {
    $backend.Refresh()
    if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}

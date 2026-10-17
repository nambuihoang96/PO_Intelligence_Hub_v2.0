param([string]$PythonExecutable)

$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$setupScript = Join-Path $workspace 'scripts\setup.ps1'
$venvPython = if ([string]::IsNullOrWhiteSpace($PythonExecutable)) {
    Join-Path $workspace '.venv\Scripts\python.exe'
} else {
    (Resolve-Path -LiteralPath $PythonExecutable).Path
}
$frontendPath = Join-Path $workspace 'frontend'
$npm = Get-Command npm -ErrorAction SilentlyContinue
$node = Get-Command node -ErrorAction SilentlyContinue

if (-not $npm -or -not $node) { throw 'Node.js 22+ with npm was not found. Install Node.js, then double-click run.bat again.' }

if (-not (Test-Path $venvPython) -or -not (Test-Path (Join-Path $frontendPath 'node_modules'))) {
    Write-Host 'First launch: preparing the local environment. This may take a few minutes.'
    if ([string]::IsNullOrWhiteSpace($PythonExecutable)) { & $setupScript } else { & $setupScript -PythonExecutable $PythonExecutable }
}
if (-not (Test-Path $venvPython) -or -not (Test-Path (Join-Path $frontendPath 'node_modules'))) { throw 'Local environment setup did not finish. Review the setup message above.' }

$backendImports = 'import fastapi, pydantic, sqlalchemy, alembic, uvicorn'
& $venvPython -c $backendImports
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Repairing the local Python environment before launch.'
    if ([string]::IsNullOrWhiteSpace($PythonExecutable)) { & $setupScript } else { & $setupScript -PythonExecutable $PythonExecutable }
    & $venvPython -c $backendImports
    if ($LASTEXITCODE -ne 0) { throw 'The local Python environment is still invalid after setup. Review the message above.' }
}

$backendAlreadyRunning = $false
$frontendAlreadyRunning = $false

function Get-PortOwnerDescription([int]$Port) {
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    $owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -eq 0) { return 'unknown process' }
    $descriptions = foreach ($ownerId in $owners) {
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if ($process) { "$($process.ProcessName) (PID $ownerId)" } else { "PID $ownerId" }
    }
    return ($descriptions -join ', ')
}

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    $backendCompatible = $false
    $backendIsOlderHub = $false
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $openApi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 3
        $backendIsOlderHub = $health.status -eq 'ok' -and $openApi.info.title -eq 'PO Intelligence Hub API'
        $backendCompatible = $backendIsOlderHub -and $openApi.paths.PSObject.Properties.Name -contains '/api/v1/reports'
    } catch { }
    if ($backendCompatible) {
        $backendAlreadyRunning = $true
        Write-Host 'Reusing the existing PO Intelligence Hub API on port 8000.'
    } else {
        $owner = Get-PortOwnerDescription 8000
        if ($backendIsOlderHub) {
            throw "Port 8000 is used by an older PO Intelligence Hub API ($owner) without the B-001 report endpoints. Stop that older API, then rerun this launcher. The process was not stopped automatically."
        }
        throw "Port 8000 is used by $owner and does not expose the expected PO Hub API. The process was not stopped. Close it manually, then retry."
    }
}

if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
    $frontendCompatible = $false
    try {
        $frontendHtml = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 3 -UseBasicParsing
        $intakeModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/reports/ResearchIntake.tsx' -TimeoutSec 3 -UseBasicParsing
        $frontendCompatible = $frontendHtml.StatusCode -eq 200 -and $frontendHtml.Content -match 'PO Intelligence Hub V2' -and $intakeModule.StatusCode -eq 200
    } catch { }
    if ($frontendCompatible) {
        $frontendAlreadyRunning = $true
        Write-Host 'Reusing the existing PO Intelligence Hub frontend on port 5173.'
    } else {
        $owner = Get-PortOwnerDescription 5173
        throw "Port 5173 is used by $owner and does not appear to be the PO Hub frontend. The process was not stopped. Close it manually, then retry."
    }
}

if ($backendAlreadyRunning -and $frontendAlreadyRunning) {
    Write-Host 'PO Intelligence Hub V2 is already running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Backend:  http://127.0.0.1:8000'
    Write-Host 'API docs: http://127.0.0.1:8000/docs'
    Start-Process 'http://127.0.0.1:5173'
    return
}

$backend = $null
$frontend = $null
if (-not $backendAlreadyRunning) {
    Push-Location $workspace
    try {
        & $venvPython -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw 'Database migration failed; see the output above.' }
    } finally { Pop-Location }
}

if (-not $backendAlreadyRunning) {
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
    } catch {
        $backend.Refresh()
        if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
        throw
    }
}

try {
    Write-Host 'PO Intelligence Hub V2 is running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Backend:  http://127.0.0.1:8000'
    Write-Host 'API docs: http://127.0.0.1:8000/docs'
    if ($frontendAlreadyRunning -and -not $backendAlreadyRunning) {
        Write-Host 'The existing frontend stays open. The newly started API remains running after this launcher exits.'
    }
    if (-not $frontendAlreadyRunning) {
        $logsPath = Join-Path $workspace 'logs'
        New-Item -ItemType Directory -Force -Path $logsPath | Out-Null
        $frontendStdout = Join-Path $logsPath 'frontend.stdout.log'
        $frontendStderr = Join-Path $logsPath 'frontend.stderr.log'
        $viteCli = Join-Path $frontendPath 'node_modules\vite\bin\vite.js'
        $frontend = Start-Process `
            -FilePath $node.Source `
            -ArgumentList @(('"' + $viteCli + '"'), '--host', '127.0.0.1') `
            -WorkingDirectory $frontendPath `
            -RedirectStandardOutput $frontendStdout `
            -RedirectStandardError $frontendStderr `
            -WindowStyle Hidden `
            -PassThru

        $frontendReady = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $frontend.Refresh()
            if ($frontend.HasExited) { throw "Frontend stopped during startup. See $frontendStderr" }
            try {
                $page = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2 -UseBasicParsing
                if ($page.StatusCode -eq 200) { $frontendReady = $true; break }
            } catch { }
            Start-Sleep -Seconds 1
        }
        if (-not $frontendReady) { throw "Frontend startup timed out. See $frontendStderr" }
    }

    Write-Host 'Opening the workspace in your browser...'
    Start-Process 'http://127.0.0.1:5173'
    Write-Host 'Keep this window open while you use the app. Press Ctrl+C to stop services started by this launcher.'
    if ($frontend) {
        while ($true) {
            $frontend.Refresh()
            if ($frontend.HasExited) { break }
            Start-Sleep -Seconds 1
        }
    }
} finally {
    if ($frontend) {
        $frontend.Refresh()
        if (-not $frontend.HasExited) { Stop-Process -Id $frontend.Id -Force }
    }
    if ($backend -and -not $frontendAlreadyRunning) {
        $backend.Refresh()
        if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
    }
}

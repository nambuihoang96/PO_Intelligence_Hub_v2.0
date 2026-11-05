param([string]$PythonExecutable)

$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
$setupScript = Join-Path $workspace 'scripts\setup.ps1'
$compatibilityScript = Join-Path $workspace 'scripts\launcher-compatibility.ps1'
. $compatibilityScript
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
$logsPath = Join-Path $workspace 'logs'
$launcherRecordPath = Join-Path $logsPath 'backend-launch.json'

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
$backendIsPoHub = $false
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2
        $openApi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 3
        $backendIsPoHub = $health.status -eq 'ok' -and $openApi.info.title -eq 'PO Intelligence Hub API'
        $compatibility = Test-PoHubOpenApiCompatibility -OpenApi $openApi
        $backendCompatible = $backendIsPoHub -and $compatibility.Compatible
    } catch { }
    if ($backendCompatible) {
        $backendAlreadyRunning = $true
        Write-Host 'Reusing the existing PO Intelligence Hub API on port 8000.'
    } else {
        $owner = Get-PortOwnerDescription 8000
        if ($backendIsPoHub) {
            $ownerIds = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
            $ownedProcessIds = @()
            $launcherRecord = $null
            if (Test-Path -LiteralPath $launcherRecordPath) {
                try { $launcherRecord = Get-Content -Raw -LiteralPath $launcherRecordPath | ConvertFrom-Json } catch { }
            }
            foreach ($ownerId in $ownerIds) {
                $processInfo = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
                try {
                    if ($processInfo -and $launcherRecord -and (Test-PoHubLauncherOwnership -Record $launcherRecord -ListenerProcessId ([int]$ownerId) -ActualProcessStartTime $processInfo.StartTime -Workspace $workspace -PythonExecutable $venvPython)) {
                        $ownedProcessIds += [int]$ownerId
                    }
                } catch { }
            }

            if ($ownedProcessIds.Count -eq $ownerIds.Count -and $ownedProcessIds.Count -gt 0) {
                Write-Host "Found an outdated PO Hub backend that this workspace launcher started ($owner). Restarting it..."
                foreach ($processId in $ownedProcessIds) { Stop-Process -Id $processId -Force -ErrorAction Stop }
                Remove-Item -LiteralPath $launcherRecordPath -Force -ErrorAction SilentlyContinue
                $portReleased = $false
                for ($attempt = 0; $attempt -lt 15; $attempt++) {
                    if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { $portReleased = $true; break }
                    Start-Sleep -Milliseconds 500
                }
                if (-not $portReleased) { throw "Stopped the outdated PO Hub backend started by this launcher, but port 8000 did not become free. Check the process using port 8000, then run run.bat again. SQLite data was not changed." }
            } else {
                if ($ownerIds.Count -eq 0) { throw "An older PO Hub service is using port 8000 ($owner), but its process could not be confirmed. Nothing was stopped and saved data was left untouched." }

                $ownerStartTimes = @{}
                foreach ($ownerId in $ownerIds) {
                    $processInfo = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
                    if (-not $processInfo) { throw "PO Hub API process $ownerId changed while startup was being checked. Nothing was stopped; double-click run.bat again." }
                    $ownerStartTimes[[string]$ownerId] = $processInfo.StartTime.ToUniversalTime().Ticks
                }

                Write-Host "An older PO Hub service is already running ($owner). This project has newer Research, CSV, Tracking and Product Analysis features."
                $answer = Read-Host 'Use the current project version? Type Y to continue; press Enter to cancel'
                if (-not (Test-PoHubRestartConfirmation -Answer $answer)) {
                    throw 'Startup cancelled. The existing PO Hub API and saved reports/CSV data were left untouched.'
                }

                $currentOwnerIds = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
                $changedOwners = @(Compare-Object -ReferenceObject @($ownerIds | Sort-Object) -DifferenceObject @($currentOwnerIds | Sort-Object))
                if ($changedOwners.Count -gt 0) { throw 'The process using port 8000 changed while waiting for your answer. Nothing was stopped; double-click run.bat again.' }
                foreach ($ownerId in $ownerIds) {
                    $processInfo = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
                    if (-not $processInfo -or $processInfo.StartTime.ToUniversalTime().Ticks -ne $ownerStartTimes[[string]$ownerId]) {
                        throw 'The process using port 8000 changed while waiting for your answer. Nothing was stopped; double-click run.bat again.'
                    }
                }

                Write-Host 'Restarting the confirmed older PO Hub API. Saved reports and CSV files will be kept.'
                foreach ($ownerId in $ownerIds) { Stop-Process -Id $ownerId -Force -ErrorAction Stop }
                $portReleased = $false
                for ($attempt = 0; $attempt -lt 15; $attempt++) {
                    if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { $portReleased = $true; break }
                    Start-Sleep -Milliseconds 500
                }
                if (-not $portReleased) { throw 'The old PO Hub API was stopped, but port 8000 did not become free. Saved reports and CSV files were not deleted. Close the other PO Hub window, then double-click run.bat again.' }
            }
        } else {
            throw "Port 8000 is used by $owner and does not expose the expected PO Hub API. The process was not stopped. Close it manually, then retry."
        }
    }
}

if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) {
    $frontendCompatible = $false
    try {
        $frontendHtml = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 3 -UseBasicParsing
        $intakeModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/reports/ResearchIntake.tsx' -TimeoutSec 3 -UseBasicParsing
        $reportApiModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/reports/api.ts' -TimeoutSec 3 -UseBasicParsing
        $comparisonModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/reports/ReportUpdateComparison.tsx' -TimeoutSec 3 -UseBasicParsing
        $trackingModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/tracking/TrackingWorkspace.tsx' -TimeoutSec 3 -UseBasicParsing
        $csvModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/research/CsvAutoAnalysis.tsx' -TimeoutSec 3 -UseBasicParsing
        $codexModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/research/CodexResearchSettings.tsx' -TimeoutSec 3 -UseBasicParsing
        $quantitativeModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/reports/QuantitativeEvidence.tsx' -TimeoutSec 3 -UseBasicParsing
        $productAnalysisModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/research/SubjectProductAnalysis.tsx' -TimeoutSec 3 -UseBasicParsing
        $projectHomeModule = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/src/research/ProjectHome.tsx' -TimeoutSec 3 -UseBasicParsing
        $frontendModules = @{
            ResearchIntake = [string]$intakeModule.Content
            ReportUpdateComparison = [string]$comparisonModule.Content
            TrackingWorkspace = [string]$trackingModule.Content
            CsvAutoAnalysis = [string]$csvModule.Content
            CodexResearchSettings = [string]$codexModule.Content
            QuantitativeEvidence = [string]$quantitativeModule.Content
            SubjectProductAnalysis = [string]$productAnalysisModule.Content
            ProjectHome = [string]$projectHomeModule.Content
        }
        $frontendFeatureCheck = Test-PoHubFrontendSourceCompatibility $frontendModules
        $frontendCompatible = $frontendHtml.StatusCode -eq 200 -and $frontendHtml.Content -match 'PO Intelligence Hub V2' -and $intakeModule.StatusCode -eq 200 -and $reportApiModule.StatusCode -eq 200 -and $reportApiModule.Content -match 'benchmark-state' -and $reportApiModule.Content -match 'codex/research' -and $productAnalysisModule.StatusCode -eq 200 -and $projectHomeModule.StatusCode -eq 200 -and $frontendFeatureCheck.Compatible
    } catch { }
    if ($frontendCompatible) {
        $frontendAlreadyRunning = $true
        Write-Host 'Reusing the existing PO Intelligence Hub frontend on port 5173.'
    } else {
        $owner = Get-PortOwnerDescription 5173
        throw "The current PO Hub page cannot be confirmed on port 5173 ($owner); it may not include the V4 Project Overview. Nothing was stopped. Close the older PO Hub window, then double-click run.bat again."
    }
}

if ($backendAlreadyRunning -and $frontendAlreadyRunning) {
    Write-Host 'PO Intelligence Hub V2 is already running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Choose a project card to open its V4 Project Overview.'
    Write-Host 'Backend:  http://127.0.0.1:8000'
    Write-Host 'API docs: http://127.0.0.1:8000/docs'
    Write-Host 'The existing services are already running; this launcher will leave them as they are.'
    Start-Process 'http://127.0.0.1:5173/research'
    return
}

$backend = $null
$frontend = $null
if (-not $backendAlreadyRunning) {
    # Back up the real database before any migration touches it. A failed backup stops startup.
    . (Join-Path $workspace 'scripts\launcher-backup.ps1')
    Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $venvPython | Out-Null
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

        try {
            $openApi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/openapi.json' -TimeoutSec 3
            $compatibility = Test-PoHubOpenApiCompatibility -OpenApi $openApi
        } catch {
            throw "The newly started backend did not expose a readable OpenAPI document. See $stderrLog. $($_.Exception.Message)"
        }
        if (-not $compatibility.Compatible) {
            throw "The newly started backend is missing required Results API operations: $($compatibility.MissingOperations -join ', '). See $stderrLog."
        }
        $launcherRecord = @{
            workspace = [System.IO.Path]::GetFullPath($workspace)
            python_executable = [System.IO.Path]::GetFullPath($venvPython)
            process_id = [int]$backend.Id
            process_started_utc = $backend.StartTime.ToUniversalTime().ToString('o')
        } | ConvertTo-Json
        New-Item -ItemType Directory -Force -Path $logsPath | Out-Null
        $recordTempPath = "$launcherRecordPath.tmp"
        [System.IO.File]::WriteAllText($recordTempPath, $launcherRecord, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $recordTempPath -Destination $launcherRecordPath -Force
    } catch {
        $backend.Refresh()
        if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
        throw
    }
}

try {
    Write-Host 'PO Intelligence Hub V2 is running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Choose a project card to open its V4 Project Overview.'
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
    Start-Process 'http://127.0.0.1:5173/research'
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
        if (Test-Path -LiteralPath $launcherRecordPath) {
            try {
                $record = Get-Content -Raw -LiteralPath $launcherRecordPath | ConvertFrom-Json
                if ([int]$record.process_id -eq [int]$backend.Id) { Remove-Item -LiteralPath $launcherRecordPath -Force }
            } catch { }
        }
    }
}

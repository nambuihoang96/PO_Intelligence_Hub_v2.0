param([string]$PythonExecutable)

$ErrorActionPreference = 'Stop'
$workspace = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($PythonExecutable) -and -not [string]::IsNullOrWhiteSpace($env:PO_HUB_PYTHON_EXECUTABLE)) {
    $PythonExecutable = $env:PO_HUB_PYTHON_EXECUTABLE
}
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

function Get-WorkspaceBuildId {
    $versionPaths = @('backend\app', 'backend\migrations', 'backend\alembic.ini', 'frontend\src', 'frontend\index.html', 'frontend\vite.config.ts', 'frontend\package.json', 'frontend\package-lock.json', 'scripts\launcher-compatibility.ps1', 'run-local.ps1', 'run-local.bat', 'run.bat')
    $commit = (& git -C $workspace rev-parse --short HEAD 2>$null | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($commit)) { $commit = 'uncommitted' }
    $manifest = [System.Collections.Generic.List[string]]::new()
    $manifest.Add($commit.Trim())
    foreach ($relativePath in $versionPaths) {
        $absolutePath = Join-Path $workspace $relativePath
        if (-not (Test-Path -LiteralPath $absolutePath)) { continue }
        if ((Get-Item -LiteralPath $absolutePath).PSIsContainer) {
            $files = @(Get-ChildItem -LiteralPath $absolutePath -File -Recurse | Sort-Object FullName)
        } else { $files = @((Get-Item -LiteralPath $absolutePath)) }
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($workspace.Length).TrimStart('\')
            $manifest.Add("$relative`0$($file.Length)`0$($file.LastWriteTimeUtc.Ticks)")
        }
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($manifest -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0, 16) }
    finally { $sha.Dispose() }
    return "$($commit.Trim())-$hash"
}

function Get-ExpectedDataRoot {
    $configuredRoot = $env:APP_DATA_ROOT
    if ([string]::IsNullOrWhiteSpace($configuredRoot)) {
        $envFile = Join-Path $workspace '.env'
        if (Test-Path -LiteralPath $envFile) {
            foreach ($line in Get-Content -LiteralPath $envFile) {
                $parts = $line -split '=', 2
                if ($parts.Count -eq 2 -and $parts[0].Trim() -eq 'APP_DATA_ROOT') {
                    $configuredRoot = $parts[1].Trim().Trim('"').Trim("'")
                    break
                }
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($configuredRoot)) { return [System.IO.Path]::GetFullPath((Join-Path $workspace 'data')) }
    $expandedRoot = [Environment]::ExpandEnvironmentVariables($configuredRoot)
    if ([System.IO.Path]::IsPathRooted($expandedRoot)) { return [System.IO.Path]::GetFullPath($expandedRoot) }
    return [System.IO.Path]::GetFullPath((Join-Path $workspace $expandedRoot))
}

$workspaceBuildId = Get-WorkspaceBuildId
$expectedDataRoot = Get-ExpectedDataRoot
$workspaceBranch = (& git -C $workspace branch --show-current 2>$null | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($workspaceBranch)) { $workspaceBranch = 'unknown branch' }
Write-Host "Workspace: $workspace"
Write-Host "Version:   $workspaceBranch / $workspaceBuildId"

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
$frontendRecordPath = Join-Path $logsPath 'frontend-launch.json'

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
        $ownerIds = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
        $launcherRecord = $null
        if (Test-Path -LiteralPath $launcherRecordPath) {
            try { $launcherRecord = Get-Content -Raw -LiteralPath $launcherRecordPath | ConvertFrom-Json } catch { }
        }
        $ownedProcessIds = @()
        foreach ($ownerId in $ownerIds) {
            $processInfo = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
            try {
                if ($processInfo -and $launcherRecord -and (Test-PoHubLauncherOwnership -Record $launcherRecord -ListenerProcessId ([int]$ownerId) -ActualProcessStartTime $processInfo.StartTime -Workspace $workspace -PythonExecutable $venvPython)) {
                    $ownedProcessIds += [int]$ownerId
                }
            } catch { }
        }
        if ($ownedProcessIds.Count -eq $ownerIds.Count -and $ownedProcessIds.Count -gt 0) {
            if (Test-PoHubBuildMatch -Record $launcherRecord -BuildId $workspaceBuildId -DataRoot $expectedDataRoot) {
                $backendAlreadyRunning = $true
                Write-Host 'Reusing the API started by this workspace with the matching current source version.'
            } else {
                Write-Host "Restarting the API started by this workspace because its source version or data location is stale ($ownerIds)."
                foreach ($processId in $ownedProcessIds) { Stop-Process -Id $processId -Force -ErrorAction Stop }
                Remove-Item -LiteralPath $launcherRecordPath -Force -ErrorAction SilentlyContinue
                $portReleased = $false
                for ($attempt = 0; $attempt -lt 15; $attempt++) {
                    if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) { $portReleased = $true; break }
                    Start-Sleep -Milliseconds 500
                }
                if (-not $portReleased) { throw "Stopped the workspace-owned old API, but port 8000 did not become free. Check PID(s) $($ownerIds -join ', '), then retry. No unrelated process was stopped." }
            }
        } else {
            $pidList = if ($ownerIds.Count) { $ownerIds -join ', ' } else { 'unknown' }
            throw "Port 8000 is serving a compatible PO Hub API, but its workspace/version cannot be proven to match this run.bat ($workspaceBuildId). PID(s): $pidList. Nothing was stopped. Close the old PO Hub window that owns this port, then run this workspace's run.bat again."
        }
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
                $missingOperations = if ($compatibility) { $compatibility.MissingOperations -join ', ' } else { 'OpenAPI compatibility could not be verified.' }
                $pidList = if ($ownerIds.Count) { $ownerIds -join ', ' } else { 'unknown' }
                throw "Port 8000 is used by an outdated PO Intelligence Hub API ($owner). Missing: $missingOperations. PID(s): $pidList. This process has no valid ownership record from this workspace launcher, so it was left running. In PowerShell, confirm the PID belongs to this old PO Hub window, then run: Stop-Process -Id <PID>. After it stops, double-click run.bat again. SQLite data was not changed."
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
        $frontendCompatible = $frontendHtml.StatusCode -eq 200 -and $frontendHtml.Content -match 'PO Intelligence Hub V2' -and $intakeModule.StatusCode -eq 200 -and $reportApiModule.StatusCode -eq 200 -and $reportApiModule.Content -match 'benchmark-state'
    } catch { }
    if ($frontendCompatible) {
        $ownerIds = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
        $frontendRecord = $null
        if (Test-Path -LiteralPath $frontendRecordPath) {
            try { $frontendRecord = Get-Content -Raw -LiteralPath $frontendRecordPath | ConvertFrom-Json } catch { }
        }
        $ownedProcessIds = @()
        foreach ($ownerId in $ownerIds) {
            $processInfo = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
            try {
                if ($processInfo -and $frontendRecord -and (Test-PoHubFrontendOwnership -Record $frontendRecord -ListenerProcessId ([int]$ownerId) -ActualProcessStartTime $processInfo.StartTime -Workspace $workspace -NodeExecutable $node.Source -FrontendPath $frontendPath)) {
                    $ownedProcessIds += [int]$ownerId
                }
            } catch { }
        }
        if ($ownedProcessIds.Count -eq $ownerIds.Count -and $ownerIds.Count -gt 0 -and (Test-PoHubBuildMatch -Record $frontendRecord -BuildId $workspaceBuildId) -and [string]$frontendRecord.api_target -eq 'http://127.0.0.1:8000') {
            $frontendAlreadyRunning = $true
            Write-Host 'Reusing the frontend started by this workspace with the matching current source version.'
        } elseif ($ownedProcessIds.Count -eq $ownerIds.Count -and $ownedProcessIds.Count -gt 0) {
            Write-Host "Restarting the frontend started by this workspace because its source version is stale ($ownerIds)."
            foreach ($processId in $ownedProcessIds) { Stop-Process -Id $processId -Force -ErrorAction Stop }
            Remove-Item -LiteralPath $frontendRecordPath -Force -ErrorAction SilentlyContinue
            $portReleased = $false
            for ($attempt = 0; $attempt -lt 15; $attempt++) {
                if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) { $portReleased = $true; break }
                Start-Sleep -Milliseconds 500
            }
            if (-not $portReleased) { throw "Stopped the workspace-owned old frontend, but port 5173 did not become free. Check PID(s) $($ownerIds -join ', '), then retry. No unrelated process was stopped." }
        } else {
            $pidList = if ($ownerIds.Count) { $ownerIds -join ', ' } else { 'unknown' }
            throw "Port 5173 serves PO Hub, but its workspace/version cannot be proven to match this run.bat ($workspaceBuildId). PID(s): $pidList. Nothing was stopped. Close the old PO Hub window that owns this port, then run this workspace's run.bat again."
        }
    } else {
        $owner = Get-PortOwnerDescription 5173
        throw "Port 5173 is used by $owner and does not serve the current PO Hub Results client (including the Benchmark API contract). The process was not stopped. Close the old frontend window/terminal, then retry run.bat."
    }
}

if ($backendAlreadyRunning -and $frontendAlreadyRunning) {
    Write-Host 'PO Intelligence Hub V2 is already running.'
    Write-Host 'Frontend: http://127.0.0.1:5173'
    Write-Host 'Backend:  http://127.0.0.1:8000'
    Write-Host 'API docs: http://127.0.0.1:8000/docs'
    Write-Host 'This launcher did not start the existing services, so it will not stop them.'
    Write-Host 'Press any key to close this launcher window. The existing services will keep running.'
    if ($env:PO_HUB_SKIP_BROWSER_OPEN -eq '1') { Write-Host 'Browser launch skipped by PO_HUB_SKIP_BROWSER_OPEN=1.' }
    else { Start-Process 'http://127.0.0.1:5173' }
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    return
}

$backend = $null
$frontend = $null
if (-not $backendAlreadyRunning) {
    Write-Host 'Starting the API and waiting for its health and route checks...'
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
        -ArgumentList @('-u', '-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory $workspace `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    try {
        $backendReady = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
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
            source_fingerprint = $workspaceBuildId
            data_root = $expectedDataRoot
            branch = $workspaceBranch.Trim()
            commit = (& git -C $workspace rev-parse HEAD 2>$null | Select-Object -First 1).Trim()
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
        $previousApiTarget = $env:DEVCREW_UAT_API_TARGET
        try {
            $env:DEVCREW_UAT_API_TARGET = 'http://127.0.0.1:8000'
            $frontend = Start-Process `
                -FilePath $node.Source `
                -ArgumentList @(('"' + $viteCli + '"'), '--host', '127.0.0.1') `
                -WorkingDirectory $frontendPath `
                -RedirectStandardOutput $frontendStdout `
                -RedirectStandardError $frontendStderr `
                -WindowStyle Hidden `
                -PassThru
        } finally {
            if ($null -eq $previousApiTarget) { Remove-Item Env:DEVCREW_UAT_API_TARGET -ErrorAction SilentlyContinue }
            else { $env:DEVCREW_UAT_API_TARGET = $previousApiTarget }
        }

        $frontendReady = $false
        for ($attempt = 0; $attempt -lt 45; $attempt++) {
            $frontend.Refresh()
            if ($frontend.HasExited) { throw "Frontend stopped during startup. See $frontendStderr" }
            try {
                $page = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2 -UseBasicParsing
                if ($page.StatusCode -eq 200) { $frontendReady = $true; break }
            } catch { }
            Start-Sleep -Seconds 1
        }
        if (-not $frontendReady) { throw "Frontend startup timed out. See $frontendStderr" }
        $frontendRecord = @{
            workspace = [System.IO.Path]::GetFullPath($workspace)
            frontend_path = [System.IO.Path]::GetFullPath($frontendPath)
            node_executable = [System.IO.Path]::GetFullPath($node.Source)
            process_id = [int]$frontend.Id
            process_started_utc = $frontend.StartTime.ToUniversalTime().ToString('o')
            source_fingerprint = $workspaceBuildId
            api_target = 'http://127.0.0.1:8000'
            branch = $workspaceBranch.Trim()
            commit = (& git -C $workspace rev-parse HEAD 2>$null | Select-Object -First 1).Trim()
        } | ConvertTo-Json
        $frontendRecordTempPath = "$frontendRecordPath.tmp"
        [System.IO.File]::WriteAllText($frontendRecordTempPath, $frontendRecord, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $frontendRecordTempPath -Destination $frontendRecordPath -Force
    }

    if ($env:PO_HUB_SKIP_BROWSER_OPEN -eq '1') {
        Write-Host 'Browser launch skipped by PO_HUB_SKIP_BROWSER_OPEN=1.'
    } else {
        Write-Host 'Opening the workspace in your browser...'
        Start-Process 'http://127.0.0.1:5173'
    }
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
        if (Test-Path -LiteralPath $frontendRecordPath) {
            try {
                $record = Get-Content -Raw -LiteralPath $frontendRecordPath | ConvertFrom-Json
                if ([int]$record.process_id -eq [int]$frontend.Id) { Remove-Item -LiteralPath $frontendRecordPath -Force }
            } catch { }
        }
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

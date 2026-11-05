param([string]$PythonExecutable)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$venvPath = Join-Path $workspace '.venv'

if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
    $basePython = (Resolve-Path -LiteralPath $PythonExecutable).Path
} else {
    $basePython = $null
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $candidate = & $pyLauncher.Source -3.12 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0) { $basePython = ($candidate | Select-Object -Last 1).Trim() }
    }
    if (-not $basePython) {
        $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
        if ($pythonCommand) { $basePython = $pythonCommand.Source }
    }
}

if (-not $basePython -or -not (Test-Path -LiteralPath $basePython)) {
    throw 'Python 3.12+ was not found. Install Python 3.12, then rerun scripts\setup.ps1.'
}

$versionParts = & $basePython -c 'import sys; print(sys.version_info[0], sys.version_info[1])'
if ($LASTEXITCODE -ne 0) { throw 'Unable to query the selected Python interpreter.' }
$version = ($versionParts -join ' ').Trim() -split '\s+'
if ([int]$version[0] -lt 3 -or ([int]$version[0] -eq 3 -and [int]$version[1] -lt 12)) {
    throw 'Python 3.12+ is required. Install Python 3.12, then rerun scripts\setup.ps1.'
}

$backupVenv = $null
if (Test-Path -LiteralPath $venvPath) {
    $existingPython = Join-Path $venvPath 'Scripts\python.exe'
    $existingVersion = $null
    if (Test-Path -LiteralPath $existingPython) {
        $existingParts = & $existingPython -c 'import sys; print(sys.version_info[0], sys.version_info[1])' 2>$null
        if ($LASTEXITCODE -eq 0) { $existingVersion = ($existingParts -join ' ').Trim() }
    }
    $selectedVersion = "$($version[0]) $($version[1])"
    if ($existingVersion -ne $selectedVersion) {
        $backupVenv = Join-Path $workspace ('.venv.backup-' + [Guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $venvPath -Destination $backupVenv
    }
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $venvPath 'Scripts\python.exe'))) {
        & $basePython -m venv $venvPath
        if ($LASTEXITCODE -ne 0) { throw 'Creating the Python virtual environment failed.' }
    }

    $venvPython = Join-Path $venvPath 'Scripts\python.exe'
    & $venvPython -m pip install --disable-pip-version-check -r (Join-Path $workspace 'backend\requirements.lock')
    if ($LASTEXITCODE -ne 0) { throw 'Installing backend dependencies failed.' }

    Push-Location (Join-Path $workspace 'frontend')
    try {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Installing frontend dependencies failed.' }
    } finally { Pop-Location }
} catch {
    if ($backupVenv -and (Test-Path -LiteralPath $backupVenv)) {
        if (Test-Path -LiteralPath $venvPath) { Remove-Item -LiteralPath $venvPath -Recurse -Force }
        Move-Item -LiteralPath $backupVenv -Destination $venvPath
    }
    throw
}

if ($backupVenv -and (Test-Path -LiteralPath $backupVenv)) {
    try {
        Remove-Item -LiteralPath $backupVenv -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Warning "Setup succeeded, but the previous environment backup could not be deleted: $backupVenv"
    }
}

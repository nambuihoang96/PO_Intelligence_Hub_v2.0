$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) {
    & py -3.12 -m venv (Join-Path $workspace '.venv')
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $workspace '.venv\Scripts\python.exe'))) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Python 3.12+ was not found. Install Python, then rerun scripts\setup.ps1.' }
    & python -m venv (Join-Path $workspace '.venv')
}
if ($LASTEXITCODE -ne 0) { throw 'Creating the Python virtual environment failed.' }
$venvPython = Join-Path $workspace '.venv\Scripts\python.exe'
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $workspace 'backend\requirements.lock')
if ($LASTEXITCODE -ne 0) {
    $pip = Get-Command pip -ErrorAction SilentlyContinue
    if (-not $pip) { throw 'pip is unavailable for the project virtual environment.' }
    & $pip.Source --python $venvPython install --disable-pip-version-check -r (Join-Path $workspace 'backend\requirements.lock')
    if ($LASTEXITCODE -ne 0) { throw 'Installing backend dependencies failed.' }
}
Push-Location (Join-Path $workspace 'frontend')
try {
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Installing frontend dependencies failed.' }
} finally { Pop-Location }

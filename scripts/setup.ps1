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
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $workspace 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Installing backend dependencies failed.' }
Push-Location (Join-Path $workspace 'frontend')
try {
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Installing frontend dependencies failed.' }
} finally { Pop-Location }

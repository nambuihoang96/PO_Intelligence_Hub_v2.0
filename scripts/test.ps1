$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $workspace '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) { throw 'Dependencies are missing. Run scripts\setup.ps1 first.' }
Push-Location $workspace
try {
    & $venvPython -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Backend smoke tests failed.' }
} finally { Pop-Location }
Push-Location (Join-Path $workspace 'frontend')
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }

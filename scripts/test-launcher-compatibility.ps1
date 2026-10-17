$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-compatibility.ps1')

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message (expected '$Expected', got '$Actual')" }
}

$oldBackend = @{
    info = @{ title = 'PO Intelligence Hub API' }
    paths = @{
        '/api/v1/reports' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/reprocess' = @{ post = @{} }
        '/api/v1/reports/{report_id}/structured-data' = @{ put = @{} }
        '/api/v1/reports/{report_id}/structure-from-response' = @{ put = @{} }
    }
} | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$result = Test-PoHubOpenApiCompatibility $oldBackend
Assert-Equal $result.IsPoHub $true 'An old Hub backend should be identified'
Assert-Equal $result.Compatible $false 'The backend without benchmark-state must be rejected'
Assert-Equal ($result.MissingOperations -contains 'PUT /api/v1/reports/{report_id}/benchmark-state') $true 'Missing benchmark-state must be reported'

$currentBackend = @{
    info = @{ title = 'PO Intelligence Hub API' }
    paths = @{
        '/api/v1/reports' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/reprocess' = @{ post = @{} }
        '/api/v1/reports/{report_id}/structured-data' = @{ put = @{} }
        '/api/v1/reports/{report_id}/structure-from-response' = @{ put = @{} }
        '/api/v1/reports/{report_id}/benchmark-state' = @{ put = @{} }
    }
} | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$result = Test-PoHubOpenApiCompatibility $currentBackend
Assert-Equal $result.Compatible $true 'The current backend with the expected methods should pass'

$wrongMethod = @{
    info = @{ title = 'PO Intelligence Hub API' }
    paths = @{
        '/api/v1/reports' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/reprocess' = @{ post = @{} }
        '/api/v1/reports/{report_id}/structured-data' = @{ put = @{} }
        '/api/v1/reports/{report_id}/structure-from-response' = @{ put = @{} }
        '/api/v1/reports/{report_id}/benchmark-state' = @{ post = @{} }
    }
} | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$result = Test-PoHubOpenApiCompatibility $wrongMethod
Assert-Equal $result.Compatible $false 'A route with the wrong HTTP method must be rejected'

$wrongService = @{
    info = @{ title = 'Unrelated Service' }
    paths = @{}
} | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$result = Test-PoHubOpenApiCompatibility $wrongService
Assert-Equal $result.IsPoHub $false 'A different service occupying the port must not be identified as the Hub'
Assert-Equal $result.Compatible $false 'A different service must be rejected'

$workspace = Split-Path -Parent $PSScriptRoot
$workspacePython = Join-Path $workspace '.venv\Scripts\python.exe'
$oldHubCommand = '"' + $workspacePython + '" -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000'
Assert-Equal (Test-PoHubProcessFromWorkspace -ExecutablePath $workspacePython -CommandLine $oldHubCommand -Workspace $workspace) $true 'An outdated backend started from this workspace should be safe to restart'
Assert-Equal (Test-PoHubProcessFromWorkspace -ExecutablePath 'C:\Python312\python.exe' -CommandLine $oldHubCommand -Workspace $workspace) $false 'A Python process outside this workspace must not be stopped automatically'
Assert-Equal (Test-PoHubProcessFromWorkspace -ExecutablePath $workspacePython -CommandLine 'python -m http.server 8000' -Workspace $workspace) $false 'A non-PO process must not be stopped automatically'

Write-Host 'Launcher compatibility tests passed (7 cases).'

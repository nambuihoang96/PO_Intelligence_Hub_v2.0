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

Assert-Equal (Test-PoHubPythonProcess -ProcessName 'python') $true 'A Python process serving the positively identified stale PO Hub API should be restartable'
Assert-Equal (Test-PoHubPythonProcess -ProcessName 'python.exe') $true 'A Python executable process should be recognized'
Assert-Equal (Test-PoHubPythonProcess -ProcessName 'node') $false 'A non-Python listener must not be stopped automatically'

Write-Host 'Launcher compatibility tests passed (7 cases).'

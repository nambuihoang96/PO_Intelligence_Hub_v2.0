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
 $pythonExecutable = Join-Path $workspace '.venv\Scripts\python.exe'
 $actualStartTime = [datetime]::SpecifyKind([datetime]'2026-10-18T10:00:00.1234567', [DateTimeKind]::Utc)
 $record = [pscustomobject]@{
    workspace = [System.IO.Path]::GetFullPath($workspace)
    python_executable = [System.IO.Path]::GetFullPath($pythonExecutable)
    process_id = 4567
    process_started_utc = $actualStartTime.ToString('o')
 }
Assert-Equal (Test-PoHubLauncherOwnership -Record $record -ListenerProcessId 4567 -ActualProcessStartTime $actualStartTime -Workspace $workspace -PythonExecutable $pythonExecutable) $true 'A matching launcher receipt, PID, start time, and workspace should be trusted'
Assert-Equal (Test-PoHubLauncherOwnership -Record $record -ListenerProcessId 4568 -ActualProcessStartTime $actualStartTime -Workspace $workspace -PythonExecutable $pythonExecutable) $false 'A different listener PID must not be stopped'
Assert-Equal (Test-PoHubLauncherOwnership -Record $record -ListenerProcessId 4567 -ActualProcessStartTime $actualStartTime.AddSeconds(1) -Workspace $workspace -PythonExecutable $pythonExecutable) $false 'A reused PID with a different start time must not be stopped'
Assert-Equal (Test-PoHubLauncherOwnership -Record $record -ListenerProcessId 4567 -ActualProcessStartTime $actualStartTime -Workspace (Join-Path $workspace 'other') -PythonExecutable $pythonExecutable) $false 'A receipt from another workspace must not be trusted'
Assert-Equal (Test-PoHubLauncherOwnership -Record $record -ListenerProcessId 4567 -ActualProcessStartTime $actualStartTime -Workspace $workspace -PythonExecutable 'C:\Python312\python.exe') $false 'A receipt from another Python environment must not be trusted'

Write-Host 'Launcher compatibility tests passed (9 cases).'

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'launcher-compatibility.ps1')

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    Write-Host "PASS: $Message"
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
$oldCompatibility = Test-PoHubOpenApiCompatibility -OpenApi $oldBackend
Assert $oldCompatibility.IsPoHub 'older Hub API is recognized'
Assert (-not $oldCompatibility.Compatible) 'Hub API missing benchmark-state is rejected'
Assert ($oldCompatibility.MissingOperations -contains 'PUT /api/v1/reports/{report_id}/benchmark-state') 'missing benchmark-state is reported'

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
Assert (Test-PoHubOpenApiCompatibility -OpenApi $currentBackend).Compatible 'current Hub API contract passes'

$wrongMethod = $currentBackend | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$wrongMethod.paths.'/api/v1/reports/{report_id}/benchmark-state' = @{ post = @{} }
$wrongMethodResult = Test-PoHubOpenApiCompatibility -OpenApi $wrongMethod
Assert (-not $wrongMethodResult.Compatible) 'wrong HTTP method is rejected'

$wrongService = @{ info = @{ title = 'Other Service' }; paths = @{} } | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$wrongServiceResult = Test-PoHubOpenApiCompatibility -OpenApi $wrongService
Assert (-not $wrongServiceResult.IsPoHub -and -not $wrongServiceResult.Compatible) 'unrelated service is rejected'

$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$python = Join-Path $workspace '.venv\Scripts\python.exe'
$node = Join-Path $workspace 'frontend\node.exe'
$frontend = Join-Path $workspace 'frontend'
$started = [datetime]::SpecifyKind([datetime]'2026-10-30T10:11:12', [DateTimeKind]::Utc)
$startedText = [DateTimeOffset]$started

$backendRecord = [pscustomobject]@{
    workspace = $workspace
    python_executable = $python
    process_id = 421
    process_started_utc = $startedText.ToString('o')
    source_fingerprint = 'commit-sourcehash'
    data_root = (Join-Path $workspace 'data')
}
Assert (Test-PoHubLauncherOwnership -Record $backendRecord -ListenerProcessId 421 -ActualProcessStartTime $started -Workspace $workspace -PythonExecutable $python) 'backend ownership matches workspace, interpreter, PID and start time'
Assert (-not (Test-PoHubLauncherOwnership -Record $backendRecord -ListenerProcessId 422 -ActualProcessStartTime $started -Workspace $workspace -PythonExecutable $python)) 'backend PID mismatch is rejected'
Assert (-not (Test-PoHubLauncherOwnership -Record $backendRecord -ListenerProcessId 421 -ActualProcessStartTime $started.AddSeconds(1) -Workspace $workspace -PythonExecutable $python)) 'backend process start mismatch is rejected'
Assert (-not (Test-PoHubLauncherOwnership -Record $backendRecord -ListenerProcessId 421 -ActualProcessStartTime $started -Workspace ($workspace + '-other') -PythonExecutable $python)) 'backend record from another workspace is rejected'
Assert (-not (Test-PoHubLauncherOwnership -Record $backendRecord -ListenerProcessId 421 -ActualProcessStartTime $started -Workspace $workspace -PythonExecutable 'C:\Python312\python.exe')) 'backend record from another Python environment is rejected'
Assert (Test-PoHubBuildMatch -Record $backendRecord -BuildId 'commit-sourcehash' -DataRoot (Join-Path $workspace 'data')) 'matching source fingerprint and data root are accepted'
Assert (-not (Test-PoHubBuildMatch -Record $backendRecord -BuildId 'new-sourcehash' -DataRoot (Join-Path $workspace 'data'))) 'stale source fingerprint is rejected'
Assert (-not (Test-PoHubBuildMatch -Record $backendRecord -BuildId 'commit-sourcehash' -DataRoot (Join-Path $workspace 'qa-data'))) 'a different database root is rejected'
Assert (-not (Test-PoHubBuildMatch -Record ([pscustomobject]@{ source_fingerprint = '' }) -BuildId 'commit-sourcehash')) 'legacy launcher record without a fingerprint is rejected'

$frontendRecord = [pscustomobject]@{
    workspace = $workspace
    frontend_path = $frontend
    node_executable = $node
    process_id = 531
    process_started_utc = $startedText.ToString('o')
}
Assert (Test-PoHubFrontendOwnership -Record $frontendRecord -ListenerProcessId 531 -ActualProcessStartTime $started -Workspace $workspace -NodeExecutable $node -FrontendPath $frontend) 'frontend ownership matches workspace, frontend, Node, PID and start time'
Assert (-not (Test-PoHubFrontendOwnership -Record $frontendRecord -ListenerProcessId 531 -ActualProcessStartTime $started -Workspace ($workspace + '-other') -NodeExecutable $node -FrontendPath $frontend)) 'frontend from another workspace is rejected'

$tokens = $null
$parseErrors = $null
$runLocalAst = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $workspace 'run-local.ps1'), [ref]$tokens, [ref]$parseErrors)
$dataRootFunction = $runLocalAst.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-ExpectedDataRoot' }, $true)
if (-not $dataRootFunction) { throw 'Get-ExpectedDataRoot function missing' }
Invoke-Expression $dataRootFunction.Extent.Text
$previousDataRoot = $env:APP_DATA_ROOT
try {
    $env:APP_DATA_ROOT = Join-Path $workspace 'qa-data'
    Assert ((Get-ExpectedDataRoot) -eq (Join-Path $workspace 'qa-data')) 'absolute QA data root is preserved'
    $env:APP_DATA_ROOT = 'qa-data-relative'
    Assert ((Get-ExpectedDataRoot) -eq (Join-Path $workspace 'qa-data-relative')) 'relative QA data root resolves within the workspace'
} finally {
    if ($null -eq $previousDataRoot) { Remove-Item Env:APP_DATA_ROOT -ErrorAction SilentlyContinue }
    else { $env:APP_DATA_ROOT = $previousDataRoot }
}

Write-Host 'Launcher ownership checks passed.'

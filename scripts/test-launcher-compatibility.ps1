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
Assert-Equal $result.Compatible $false 'The outdated backend must be rejected'
Assert-Equal ($result.MissingOperations -contains 'PUT /api/v1/reports/{report_id}/benchmark-state') $true 'Missing benchmark-state must be reported'
Assert-Equal ($result.MissingOperations -contains 'GET /api/v1/codex/models') $true 'Missing Codex model catalog must be reported'
Assert-Equal ($result.MissingOperations -contains 'POST /api/v1/codex/research') $true 'Missing Codex research operation must be reported'
Assert-Equal ($result.MissingOperations -contains 'PUT /api/v1/reports/{report_id}/comparison-reviews') $true 'Missing report comparison review must be reported'
Assert-Equal ($result.MissingOperations -contains 'PUT /api/v1/projects/{project_id}/opportunities/decisions/{candidate_id}/tracked-observation') $true 'Missing decision-scoped Tracking measurement must be reported'

$currentBackend = @{
    info = @{ title = 'PO Intelligence Hub API' }
    paths = @{
        '/api/v1/reports' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/reprocess' = @{ post = @{} }
        '/api/v1/reports/{report_id}/structured-data' = @{ put = @{} }
        '/api/v1/reports/{report_id}/structure-from-response' = @{ put = @{} }
        '/api/v1/reports/{report_id}/benchmark-state' = @{ put = @{} }
        '/api/v1/reports/{report_id}/comparison-reviews' = @{ put = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/preview' = @{ post = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/metadata' = @{ put = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/revalidate' = @{ post = @{} }
        '/api/v1/projects/{project_id}/opportunities' = @{ get = @{} }
        '/api/v1/projects/{project_id}/opportunities/decisions' = @{ put = @{} }
        '/api/v1/projects/{project_id}/opportunities/decisions/{candidate_id}/tracked-observation' = @{ put = @{} }
        '/api/v1/codex/models' = @{ get = @{} }
        '/api/v1/codex/research' = @{ post = @{ requestBody = @{ content = @{ 'application/json' = @{ schema = @{ '$ref' = '#/components/schemas/CodexResearchRequest' } } } } } }
    }
    components = @{ schemas = @{ CodexResearchRequest = @{ properties = @{ allow_web_search = @{ type = 'boolean' } } } } }
} | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$result = Test-PoHubOpenApiCompatibility $currentBackend
Assert-Equal $result.Compatible $true 'The current backend with the expected methods should pass'
$currentBackend.components.schemas.CodexResearchRequest.properties.PSObject.Properties.Remove('allow_web_search')
$result = Test-PoHubOpenApiCompatibility $currentBackend
Assert-Equal $result.Compatible $false 'A backend without source-only Codex mode should fail compatibility'
Assert-Equal ($result.MissingOperations -contains 'allow_web_search field on POST /api/v1/codex/research') $true 'The missing Codex body capability should be identified'

$wrongMethod = @{
    info = @{ title = 'PO Intelligence Hub API' }
    paths = @{
        '/api/v1/reports' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/reprocess' = @{ post = @{} }
        '/api/v1/reports/{report_id}/structured-data' = @{ put = @{} }
        '/api/v1/reports/{report_id}/structure-from-response' = @{ put = @{} }
        '/api/v1/reports/{report_id}/benchmark-state' = @{ post = @{} }
        '/api/v1/reports/{report_id}/comparison-reviews' = @{ put = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/preview' = @{ post = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets' = @{ get = @{}; post = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}' = @{ get = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/metadata' = @{ put = @{} }
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/revalidate' = @{ post = @{} }
        '/api/v1/projects/{project_id}/opportunities' = @{ get = @{} }
        '/api/v1/projects/{project_id}/opportunities/decisions' = @{ put = @{} }
        '/api/v1/projects/{project_id}/opportunities/decisions/{candidate_id}/tracked-observation' = @{ put = @{} }
        '/api/v1/codex/models' = @{ get = @{} }
        '/api/v1/codex/research' = @{ post = @{} }
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
Assert-Equal (Test-PoHubRestartConfirmation -Answer 'Y') $true 'An explicit Y should confirm an outdated PO Hub restart'
Assert-Equal (Test-PoHubRestartConfirmation -Answer ' y ') $true 'A whitespace-padded lowercase y should be accepted'
Assert-Equal (Test-PoHubRestartConfirmation -Answer 'N') $false 'N must leave the existing process untouched'
Assert-Equal (Test-PoHubRestartConfirmation -Answer '') $false 'An empty answer must leave the existing process untouched'

$currentFrontend = @{
    ResearchIntake = 'report-research-again'
    ReportUpdateComparison = 'report-update-glance'
    TrackingWorkspace = 'report-updates'
    CsvAutoAnalysis = 'csv-auto-analysis-title'
    CodexResearchSettings = 'codex-research-settings'
    QuantitativeEvidence = 'quantitative-observation-disclosure'
    SubjectProductAnalysis = 'subject-product-analysis'
    ProjectHome = 'project-home-journey-steps'
}
$result = Test-PoHubFrontendSourceCompatibility $currentFrontend
Assert-Equal $result.Compatible $true 'The latest Research, comparison, Tracking, CSV, Codex, quantitative and Product Analysis UI modules should pass'
$currentFrontend.Remove('ReportUpdateComparison')
$result = Test-PoHubFrontendSourceCompatibility $currentFrontend
Assert-Equal $result.Compatible $false 'A frontend missing the report comparison module should not be reused'
$currentFrontend['ReportUpdateComparison'] = 'report-update-glance'
$currentFrontend.Remove('SubjectProductAnalysis')
$result = Test-PoHubFrontendSourceCompatibility $currentFrontend
Assert-Equal $result.Compatible $false 'A frontend missing Product Analysis should not be reused'
$currentFrontend['SubjectProductAnalysis'] = 'subject-product-analysis'
$currentFrontend.Remove('ProjectHome')
$result = Test-PoHubFrontendSourceCompatibility $currentFrontend
Assert-Equal $result.Compatible $false 'A frontend missing the V4 Project Overview should not be reused'

Write-Host 'Launcher compatibility tests passed (24 assertions).'

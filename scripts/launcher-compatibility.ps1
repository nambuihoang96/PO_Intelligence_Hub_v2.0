function Test-PoHubOpenApiCompatibility {
    param([Parameter(Mandatory = $true)]$OpenApi)

    if (-not $OpenApi.info -or $OpenApi.info.title -ne 'PO Intelligence Hub API') {
        return [pscustomobject]@{
            Compatible = $false
            IsPoHub = $false
            MissingOperations = @()
            Reason = 'The service does not identify itself as the PO Intelligence Hub API.'
        }
    }

    $requiredOperations = [ordered]@{
        '/api/v1/reports' = @('get', 'post')
        '/api/v1/reports/{report_id}' = @('get')
        '/api/v1/reports/{report_id}/reprocess' = @('post')
        '/api/v1/reports/{report_id}/structured-data' = @('put')
        '/api/v1/reports/{report_id}/structure-from-response' = @('put')
        '/api/v1/reports/{report_id}/benchmark-state' = @('put')
        '/api/v1/reports/{report_id}/comparison-reviews' = @('put')
        '/api/v1/reports/{report_id}/quantitative-datasets/preview' = @('post')
        '/api/v1/reports/{report_id}/quantitative-datasets' = @('get', 'post')
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}' = @('get')
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/metadata' = @('put')
        '/api/v1/reports/{report_id}/quantitative-datasets/{dataset_id}/revalidate' = @('post')
        '/api/v1/projects/{project_id}/opportunities' = @('get')
        '/api/v1/projects/{project_id}/opportunities/decisions' = @('put')
        '/api/v1/projects/{project_id}/opportunities/decisions/{candidate_id}/tracked-observation' = @('put')
        '/api/v1/codex/models' = @('get')
        '/api/v1/codex/research' = @('post')
    }
    $missing = [System.Collections.Generic.List[string]]::new()

    foreach ($route in $requiredOperations.Keys) {
        $routeProperty = $OpenApi.paths.PSObject.Properties[$route]
        foreach ($method in $requiredOperations[$route]) {
            if (-not $routeProperty -or -not $routeProperty.Value.PSObject.Properties[$method]) {
                $missing.Add("$($method.ToUpperInvariant()) $route")
            }
        }
    }

    $codexRoute = $OpenApi.paths.PSObject.Properties['/api/v1/codex/research']
    $requestSchemaRef = if ($codexRoute -and $codexRoute.Value.post) { $codexRoute.Value.post.requestBody.content.'application/json'.schema.'$ref' } else { $null }
    $requestSchemaName = if ($requestSchemaRef -is [string]) { ($requestSchemaRef -split '/')[-1] } else { '' }
    $codexRequestSchema = if ($requestSchemaName -and $OpenApi.components.schemas) { $OpenApi.components.schemas.PSObject.Properties[$requestSchemaName] } else { $null }
    $allowWebSearch = if ($codexRequestSchema -and $codexRequestSchema.Value.properties) { $codexRequestSchema.Value.properties.PSObject.Properties['allow_web_search'] } else { $null }
    if (-not $allowWebSearch) { $missing.Add('allow_web_search field on POST /api/v1/codex/research') }

    return [pscustomobject]@{
        Compatible = $missing.Count -eq 0
        IsPoHub = $true
        MissingOperations = @($missing)
        Reason = if ($missing.Count -eq 0) { 'All current PO Hub workflow operations are available.' } else { "Missing required API operation(s): $($missing -join ', ')" }
    }
}

function Test-PoHubFrontendSourceCompatibility {
    param([Parameter(Mandatory = $true)][System.Collections.IDictionary]$Modules)

    $requiredMarkers = [ordered]@{
        ResearchIntake = 'report-research-again'
        ReportUpdateComparison = 'report-update-glance'
        TrackingWorkspace = 'report-updates'
        CsvAutoAnalysis = 'csv-auto-analysis-title'
        CodexResearchSettings = 'codex-research-settings'
        QuantitativeEvidence = 'quantitative-observation-disclosure'
        SubjectProductAnalysis = 'subject-product-analysis'
        ProjectHome = 'project-home-journey-steps'
    }
    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($moduleName in $requiredMarkers.Keys) {
        $content = [string]$Modules[$moduleName]
        if ([string]::IsNullOrWhiteSpace($content) -or $content -notmatch [regex]::Escape($requiredMarkers[$moduleName])) {
            $missing.Add($moduleName)
        }
    }

    return [pscustomobject]@{
        Compatible = $missing.Count -eq 0
        MissingModules = @($missing)
    }
}

function Test-PoHubLauncherOwnership {
    param(
        [Parameter(Mandatory = $true)]$Record,
        [Parameter(Mandatory = $true)][int]$ListenerProcessId,
        [Parameter(Mandatory = $true)][datetime]$ActualProcessStartTime,
        [Parameter(Mandatory = $true)][string]$Workspace,
        [Parameter(Mandatory = $true)][string]$PythonExecutable
    )

    try {
        $recordWorkspace = [System.IO.Path]::GetFullPath([string]$Record.workspace)
        $recordPython = [System.IO.Path]::GetFullPath([string]$Record.python_executable)
        $expectedWorkspace = [System.IO.Path]::GetFullPath($Workspace)
        $expectedPython = [System.IO.Path]::GetFullPath($PythonExecutable)
        $recordStart = [DateTimeOffset]::Parse([string]$Record.process_started_utc).UtcDateTime.Ticks
    } catch { return $false }

    return ([int]$Record.process_id -eq $ListenerProcessId) -and
        ($recordWorkspace.Equals($expectedWorkspace, [System.StringComparison]::OrdinalIgnoreCase)) -and
        ($recordPython.Equals($expectedPython, [System.StringComparison]::OrdinalIgnoreCase)) -and
        ($recordStart -eq $ActualProcessStartTime.ToUniversalTime().Ticks)
}

function Test-PoHubRestartConfirmation {
    param([AllowNull()][string]$Answer)

    return ([string]$Answer).Trim() -match '^(?i)y$'
}

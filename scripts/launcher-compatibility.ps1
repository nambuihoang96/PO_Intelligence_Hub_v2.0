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

    return [pscustomobject]@{
        Compatible = $missing.Count -eq 0
        IsPoHub = $true
        MissingOperations = @($missing)
        Reason = if ($missing.Count -eq 0) { 'All Results workflow operations are available.' } else { "Missing required API operation(s): $($missing -join ', ')" }
    }
}

function Test-PoHubProcessFromWorkspace {
    param(
        [Parameter(Mandatory = $true)][string]$ExecutablePath,
        [Parameter(Mandatory = $true)][string]$CommandLine,
        [Parameter(Mandatory = $true)][string]$Workspace
    )

    $workspacePrefix = [System.IO.Path]::GetFullPath($Workspace).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $fullExecutablePath = $null
    try { $fullExecutablePath = [System.IO.Path]::GetFullPath($ExecutablePath) } catch { return $false }
    $isWorkspacePython = $fullExecutablePath.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        $fullExecutablePath -match '[\\/]\.venv[\\/]Scripts[\\/]pythonw?\.exe$'
    $isUvicornBackend = $CommandLine -match '(?i)(?:-m\s+uvicorn|uvicorn(?:\.exe)?)' -and
        $CommandLine -match '(?i)backend\.app\.main:app'

    return $isWorkspacePython -and $isUvicornBackend
}

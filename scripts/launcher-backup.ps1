# Database backup helpers used by run-local.ps1 before any migration touches real data.
# Dot-source this file. It defines functions only and does not change any data by itself.

function Resolve-PoHubPath([string]$Value, [string]$Workspace) {
    # Mirrors Path(value).expanduser().resolve() in backend/app/config.py. The backend runs with the workspace as its
    # working directory, so relative values are resolved against the workspace.
    $path = $Value
    if ($path -eq '~' -or $path.StartsWith('~\') -or $path.StartsWith('~/')) { $path = $HOME + $path.Substring(1) }
    if (-not [System.IO.Path]::IsPathRooted($path)) { $path = Join-Path $Workspace $path }
    return [System.IO.Path]::GetFullPath($path)
}

function Get-PoHubDataRoot([string]$Workspace) {
    # Same order as backend/app/config.py: APP_DATA_ROOT environment variable (raw, truthy check), then the first
    # APP_DATA_ROOT line in the project .env (an empty value means default), then <workspace>\data.
    if ($env:APP_DATA_ROOT) { return Resolve-PoHubPath $env:APP_DATA_ROOT $Workspace }
    $envFile = Join-Path $Workspace '.env'
    if (Test-Path -LiteralPath $envFile) {
        # Decode as UTF-8 without stripping a BOM, so a BOM-prefixed first line is ignored exactly as config.py ignores it.
        $text = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($envFile))
        foreach ($line in ($text -split "\r?\n")) {
            $position = $line.IndexOf('=')
            if ($position -lt 0) { continue }
            $key = $line.Substring(0, $position).Trim()
            # Ordinal comparison: PowerShell -eq ignores zero-width characters such as a BOM, Python does not.
            if ([string]::Equals($key, 'APP_DATA_ROOT', [System.StringComparison]::Ordinal)) {
                $configured = $line.Substring($position + 1).Trim().Trim('"').Trim("'")
                if ($configured) { return Resolve-PoHubPath $configured $Workspace }
                break
            }
        }
    }
    return [System.IO.Path]::GetFullPath((Join-Path $Workspace 'data'))
}

function Backup-PoHubDatabase {
    <#
      Copies po_intelligence_hub.sqlite3 to <dataRoot>\..\data-backups\<yyyyMMdd-HHmmss>\ and verifies it.
      Returns the backup file path, or $null when no database exists yet (first install).
      Throws when the copy cannot be created or fails integrity_check, so the caller must not migrate.
      Keeps the newest 5 backups created by this function. Only folders named like a timestamp are touched.
    #>
    param(
        [Parameter(Mandatory)][string]$Workspace,
        [Parameter(Mandatory)][string]$PythonExecutable,
        [string]$DataRoot,
        [string]$Stamp = (Get-Date -Format 'yyyyMMdd-HHmmss'),
        [int]$KeepLatest = 5
    )
    if ([string]::IsNullOrWhiteSpace($DataRoot)) { $DataRoot = Get-PoHubDataRoot $Workspace }
    $sourceDb = Join-Path $DataRoot 'po_intelligence_hub.sqlite3'
    if (-not (Test-Path -LiteralPath $sourceDb)) {
        Write-Host 'No existing database found; nothing to back up before the first migration.'
        return $null
    }
    $backupRoot = [System.IO.Path]::GetFullPath((Join-Path $DataRoot '..\data-backups'))
    $destinationDir = Join-Path $backupRoot $Stamp
    if (Test-Path -LiteralPath $destinationDir) { throw "Backup folder already exists: $destinationDir. Nothing was migrated; run run.bat again." }
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    $destinationDb = Join-Path $destinationDir 'po_intelligence_hub.sqlite3'
    $helper = Join-Path $Workspace 'scripts\backup_sqlite.py'

    $output = & $PythonExecutable -I $helper $sourceDb $destinationDb
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $destinationDb)) {
        Remove-Item -LiteralPath $destinationDir -Recurse -Force -ErrorAction SilentlyContinue
        throw "Database backup failed or did not pass integrity_check ($($output -join ' ')). Nothing was migrated and the real database was not changed."
    }
    Write-Host "Database backup verified (integrity_check: ok): $destinationDb"

    $old = @(Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
        Sort-Object Name -Descending |
        Select-Object -Skip $KeepLatest)
    foreach ($folder in $old) { Remove-Item -LiteralPath $folder.FullName -Recurse -Force }
    return $destinationDb
}

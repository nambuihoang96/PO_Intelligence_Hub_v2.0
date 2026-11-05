$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'launcher-backup.ps1')
$python = Join-Path $workspace '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "Project Python not found: $python" }

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "FAILED: $Message" }
    Write-Host "PASS: $Message"
}

function Write-DotEnv([string]$Path, $Lines) {
    # UTF-8 without BOM, like a normal editor save; Windows PowerShell 5.1 Set-Content -Encoding UTF8 adds a BOM.
    $text = (@($Lines) -join "`r`n") + "`r`n"
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# The base folder name contains spaces on purpose, like the real project path.
$base = Join-Path ([System.IO.Path]::GetTempPath()) ('po backup test ' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base -Force | Out-Null
try {
    # 1. Data-root resolution must match backend/app/config.py.
    $fakeWorkspace = Join-Path $base 'ws'
    New-Item -ItemType Directory -Path $fakeWorkspace -Force | Out-Null
    $savedEnv = $env:APP_DATA_ROOT
    $dotenv = Join-Path $fakeWorkspace '.env'
    try {
        $env:APP_DATA_ROOT = Join-Path $base 'from-env'
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $base 'from-env'))) 'APP_DATA_ROOT environment variable is used first'
        $env:APP_DATA_ROOT = $null
        Write-DotEnv $dotenv "APP_DATA_ROOT=$base\from-dotenv"
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $base 'from-dotenv'))) '.env APP_DATA_ROOT is used when the environment variable is unset'
        Write-DotEnv $dotenv @('APP_DATA_ROOT=', 'APP_DATA_ROOT=D:\should-not-be-used')
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $fakeWorkspace 'data'))) 'first empty APP_DATA_ROOT line means default, as in config.py'
        # config.py reads .env as plain UTF-8, so a BOM before APP_DATA_ROOT makes that line invisible (default is used).
        [System.IO.File]::WriteAllBytes($dotenv, [System.Text.Encoding]::UTF8.GetPreamble() + [System.Text.Encoding]::UTF8.GetBytes("APP_DATA_ROOT=D:\bom-should-be-ignored`r`n"))
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $fakeWorkspace 'data'))) 'BOM-prefixed APP_DATA_ROOT line is ignored, matching config.py'
        Write-DotEnv $dotenv 'APP_DATA_ROOT=rel-data'
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $fakeWorkspace 'rel-data'))) 'relative APP_DATA_ROOT resolves against the workspace'
        Write-DotEnv $dotenv 'APP_DATA_ROOT=~\po-home-data'
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $HOME 'po-home-data'))) '~ in APP_DATA_ROOT expands to the home folder'
        Remove-Item -LiteralPath $dotenv -Force
        Assert-True ((Get-PoHubDataRoot $fakeWorkspace) -eq [System.IO.Path]::GetFullPath((Join-Path $fakeWorkspace 'data'))) 'default is <workspace>\data when there is no .env'
    } finally { $env:APP_DATA_ROOT = $savedEnv }

    # 2. Live app: a second process holds a WAL database open with rows that are NOT yet checkpointed into the main file.
    $liveRoot = Join-Path $base 'live data'
    New-Item -ItemType Directory -Path $liveRoot -Force | Out-Null
    $liveDb = Join-Path $liveRoot 'po_intelligence_hub.sqlite3'
    $holderScript = Join-Path $base 'hold_open.py'
    $readyFile = Join-Path $base 'ready.flag'
    $stopFile = Join-Path $base 'stop.flag'
    Set-Content -LiteralPath $holderScript -Encoding UTF8 -Value @'
import os, sqlite3, sys, time
db, ready, stop = sys.argv[1], sys.argv[2], sys.argv[3]
con = sqlite3.connect(db)
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA wal_autocheckpoint=0")
con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
con.executemany("INSERT INTO t (v) VALUES (?)", [("row %d" % i,) for i in range(250)])
con.commit()
open(ready, "w").close()
while not os.path.exists(stop):
    time.sleep(0.2)
con.close()
'@
    # Start-Process joins arguments without quoting, so quote each path that may contain spaces.
    $holderArgs = @('-I', "`"$holderScript`"", "`"$liveDb`"", "`"$readyFile`"", "`"$stopFile`"")
    $holder = Start-Process -FilePath $python -ArgumentList $holderArgs -PassThru -WindowStyle Hidden
    try {
        $waited = 0
        while (-not (Test-Path -LiteralPath $readyFile) -and $waited -lt 60) { Start-Sleep -Milliseconds 300; $waited += 0.3 }
        Assert-True (Test-Path -LiteralPath $readyFile) 'live holder process opened the database'
        $walPath = "$liveDb-wal"
        Assert-True ((Test-Path -LiteralPath $walPath) -and ((Get-Item -LiteralPath $walPath).Length -gt 0)) 'uncheckpointed WAL data exists while the app is open'
        $liveBackup = Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $python -DataRoot $liveRoot -Stamp '20260101-000001'
        Assert-True ($liveBackup -and (Test-Path -LiteralPath $liveBackup)) 'backup succeeds while the app holds the database open'
        $liveCount = & $python -I -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('select count(*) from t').fetchone()[0])" $liveBackup
        Assert-True ([int]$liveCount -eq 250) 'backup taken while the app is open contains all 250 rows (including WAL data)'
    } finally {
        New-Item -ItemType File -Path $stopFile -Force | Out-Null
        if ($holder -and -not $holder.HasExited) { $holder.WaitForExit(10000) | Out-Null }
    }

    # 3. Closed database (no open connections): backup still works.
    $dataRoot = Join-Path $base 'data'
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    $db = Join-Path $dataRoot 'po_intelligence_hub.sqlite3'
    Copy-Item -LiteralPath $liveDb -Destination $db
    foreach ($extra in @("$db-wal", "$db-shm")) { if (Test-Path -LiteralPath $extra) { Remove-Item -LiteralPath $extra -Force } }
    $backup = Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $python -DataRoot $dataRoot -Stamp '20260101-000002'
    Assert-True ($backup -and (Test-Path -LiteralPath $backup)) 'backup file is created in <dataRoot>\..\data-backups\<stamp>\'
    Assert-True ($backup -like (Join-Path $base 'data-backups\20260101-000002\po_intelligence_hub.sqlite3')) 'backup location is next to the data folder'
    $count = & $python -I -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('select count(*) from t').fetchone()[0])" $backup
    Assert-True ([int]$count -eq 250) 'closed-database backup keeps all 250 rows'

    # 4. Retention keeps only the newest 5 timestamp folders and leaves other folders alone.
    $backupRoot = Join-Path $base 'data-backups'
    1..6 | ForEach-Object { New-Item -ItemType Directory -Path (Join-Path $backupRoot ('2025010{0}-000000' -f $_)) -Force | Out-Null }
    New-Item -ItemType Directory -Path (Join-Path $backupRoot 'keep-me-manual') -Force | Out-Null
    Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $python -DataRoot $dataRoot -Stamp '20260101-000003' | Out-Null
    $stamped = @(Get-ChildItem -LiteralPath $backupRoot -Directory | Where-Object { $_.Name -match '^\d{8}-\d{6}$' })
    Assert-True ($stamped.Count -eq 5) 'only the 5 newest timestamp backups are kept'
    Assert-True (Test-Path -LiteralPath (Join-Path $backupRoot 'keep-me-manual')) 'non-timestamp folders are not deleted'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $backupRoot '20250101-000000'))) 'the oldest timestamp backup is removed'

    # 5. A corrupted database must fail loudly, must not return a backup path, and must leave no partial backup folder.
    $badRoot = Join-Path $base 'bad data'
    New-Item -ItemType Directory -Path $badRoot -Force | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $badRoot 'po_intelligence_hub.sqlite3'), [byte[]](1..4096 | ForEach-Object { 7 }))
    $failed = $false
    try { Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $python -DataRoot $badRoot -Stamp '20260101-000004' | Out-Null } catch { $failed = $true }
    Assert-True $failed 'a corrupted database makes the backup throw, so the launcher stops before migrating'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $base 'data-backups\20260101-000004'))) 'the partial backup folder is removed after a failure'

    # 6. No database yet (first install): nothing to back up, no error.
    $emptyRoot = Join-Path $base 'empty data'
    New-Item -ItemType Directory -Path $emptyRoot -Force | Out-Null
    $none = Backup-PoHubDatabase -Workspace $workspace -PythonExecutable $python -DataRoot $emptyRoot
    Assert-True ($null -eq $none) 'first install with no database skips the backup without error'

    Write-Host 'ALL LAUNCHER BACKUP TESTS PASSED'
} finally {
    Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue
}

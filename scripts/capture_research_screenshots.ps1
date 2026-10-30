# Capture Research Report screenshots with the Chrome/Edge binary already
# installed on Windows. The script does not read or write application data.
#
# Example:
# powershell -ExecutionPolicy Bypass -File scripts/capture_research_screenshots.ps1 -ReportUrl "http://127.0.0.1:15331/reports/abc123"
#
# Output is under the current worktree's .auto-presentation-qa/screenshots/
# directory and should NOT be committed with user data or QA SQLite files.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReportUrl,
  [string]$OutputDir = ".auto-presentation-qa/screenshots",
  [int]$LoadBudgetMs = 9000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$uri = $null
if (-not [Uri]::TryCreate($ReportUrl, [UriKind]::Absolute, [ref]$uri)) {
  throw "ReportUrl must be an absolute local URL."
}
if ($uri.Scheme -ne "http" -or @("127.0.0.1", "localhost", "::1") -notcontains $uri.Host) {
  throw "Safety guard: only HTTP loopback QA URLs are permitted."
}
if ($uri.AbsolutePath -notmatch "^/reports/[^/]+") {
  throw "This script captures only a report URL (/reports/<report-id>) from local QA."
}

$browsers = @(
  "$env:PROGRAMFILES\Google\Chrome\Application\chrome.exe",
  "${env:PROGRAMFILES(X86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:PROGRAMFILES\Microsoft\Edge\Application\msedge.exe",
  "${env:PROGRAMFILES(X86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $browser) {
  foreach ($command in @("chrome.exe", "msedge.exe")) {
    $entry = Get-Command $command -ErrorAction SilentlyContinue
    if ($entry) { $browser = $entry.Source; break }
  }
}
if (-not $browser) {
  throw "Neither Chrome nor Edge was found. Provide screenshots manually or install a local browser."
}

$root = (Get-Location).Path
if (-not [IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir = Join-Path $root $OutputDir
}
$null = New-Item -ItemType Directory -Path $OutputDir -Force
$output = (Resolve-Path -LiteralPath $OutputDir).Path
$profileRoot = Join-Path $env:TEMP ("pohub-research-capture-" + [Guid]::NewGuid().ToString("N"))
$null = New-Item -ItemType Directory -Path $profileRoot -Force

function Capture-Viewport([string]$label, [int]$width, [int]$height) {
  $file = Join-Path $output ("auto-presentation-" + $label + ".png")
  if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  $profile = Join-Path $profileRoot $label
  $arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--force-device-scale-factor=1",
    "--window-size=$width,$height",
    "--virtual-time-budget=$LoadBudgetMs",
    "--user-data-dir=$profile",
    "--screenshot=$file",
    $ReportUrl
  )
  & $browser @arguments 2>$null
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Browser failed to write $label screenshot. Inspect your Chrome/Edge headless permissions."
  }
  $item = Get-Item -LiteralPath $file
  if ($item.Length -lt 5000) {
    throw "Screenshot for $label is unexpectedly small ($($item.Length) bytes)."
  }
  $stream = [IO.File]::OpenRead($file)
  try {
    $header = New-Object byte[] 24
    $read = $stream.Read($header, 0, $header.Length)
    if ($read -lt 24 -or $header[0] -ne 137 -or $header[1] -ne 80 -or $header[2] -ne 78 -or $header[3] -ne 71) {
      throw "Not a PNG image: $file"
    }
    [Array]::Reverse($header, 16, 4)
    [Array]::Reverse($header, 20, 4)
    $pngWidth = [BitConverter]::ToUInt32($header, 16)
    $pngHeight = [BitConverter]::ToUInt32($header, 20)
    Write-Output ("{0}: {1}x{2} ({3} bytes) -> {4}" -f $label, $pngWidth, $pngHeight, $item.Length, $file)
    if ($pngWidth -ne $width -or $pngHeight -ne $height) {
      Write-Warning ("Headless browser screenshot dimensions differ from requested $width x $height; review before claiming viewport PASS.")
    }
  } finally {
    $stream.Dispose()
  }
}

try {
  Capture-Viewport "desktop-1440x900" 1440 900
  Capture-Viewport "responsive-390x844" 390 844
  Write-Output "Done. Review both files to verify that React data and charts finished loading."
} finally {
  if (Test-Path -LiteralPath $profileRoot) {
    Remove-Item -LiteralPath $profileRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

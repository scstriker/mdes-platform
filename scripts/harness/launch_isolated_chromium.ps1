param(
  [int]$Port = 9336,
  [string]$ProfileDir = ""
)

$ErrorActionPreference = "Stop"
if (-not $ProfileDir) {
  $ProfileDir = Join-Path $HOME ".customs-chromium-$Port"
}
$ProfileDir = [System.IO.Path]::GetFullPath($ProfileDir)
New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

$PwRoot = Join-Path $env:LOCALAPPDATA "ms-playwright"
$ChromiumBin = Get-ChildItem -Path $PwRoot -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending |
  ForEach-Object {
    $c64 = Join-Path $_.FullName "chrome-win64\chrome.exe"
    $c32 = Join-Path $_.FullName "chrome-win\chrome.exe"
    if (Test-Path $c64) { $c64 } elseif (Test-Path $c32) { $c32 }
  } |
  Select-Object -First 1

if (-not $ChromiumBin) {
  throw "Standalone Chromium not found under $PwRoot"
}

Start-Process -FilePath $ChromiumBin -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$ProfileDir",
  "--new-window",
  "--window-size=1360,920",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-features=HttpsFirstBalancedModeAutoEnable,HttpsUpgrades",
  "http://stats.customs.gov.cn/"
)

Write-Host "[OK] Standalone blue Chromium launched on port $Port (isolated from main Chrome)!" -ForegroundColor Green

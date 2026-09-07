# Builds the Whiparc CLI Windows installer (whiparc-setup-windows-amd64.exe)
# on a local Windows dev machine, without needing CI. Requires NSIS
# (makensis) on PATH — install it with:
#
#   choco install nsis
#
# Usage (from the repo root):
#   ./installers/windows/build-local.ps1
#   ./installers/windows/build-local.ps1 -Version 1.2.3

param(
    [string]$Version = "0.0.0-dev"
)

$ErrorActionPreference = "Stop"

$makensis = Get-Command makensis -ErrorAction SilentlyContinue
if (-not $makensis) {
    Write-Host "makensis not found on PATH. Install NSIS first: choco install nsis" -ForegroundColor Red
    exit 1
}

$repoRoot = Resolve-Path "$PSScriptRoot/../.."
$binaryPath = Join-Path $repoRoot "whiparc-windows-amd64.exe"

Write-Host "Building whiparc-windows-amd64.exe (version $Version)..."
Push-Location (Join-Path $repoRoot "apps/cli")
try {
    go build -ldflags="-s -w -X main.version=$Version" -o $binaryPath .
} finally {
    Pop-Location
}

Write-Host "Building installer with NSIS..."
& makensis "/DVERSION=$Version" "/DSOURCE_BINARY=$binaryPath" (Join-Path $repoRoot "installers/windows/whiparc.nsi")

Remove-Item $binaryPath -ErrorAction SilentlyContinue

Write-Host "Built whiparc-setup-windows-amd64.exe" -ForegroundColor Green

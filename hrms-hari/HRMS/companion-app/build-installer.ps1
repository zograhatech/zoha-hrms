<#
.SYNOPSIS
    Builds the Zograha Idle Companion Windows Installer and copies it to frontend/public/downloads/.
#>

[CmdletBinding()]
param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Building Zograha Idle Companion (C# .NET 8)      " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Check if .NET SDK is available
$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnetCmd) {
    Write-Warning ".NET SDK ('dotnet') is not installed or not found on PATH on this machine."
    Write-Warning "Skipping compilation step. Source code and tests are preserved in companion-app/."
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectDir = Join-Path $ScriptDir "src\ZograhaIdleCompanion"
$TestsDir = Join-Path $ScriptDir "tests\ZograhaIdleCompanion.Tests"
$FrontendPublicDownloads = Join-Path $ScriptDir "..\frontend\public\downloads"

# 2. Run Tests
Write-Host "`nRunning xUnit Unit Tests..." -ForegroundColor Yellow
& dotnet test "$TestsDir" -c $Configuration
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unit tests failed. Aborting installer build."
    exit $LASTEXITCODE
}

# 3. Publish single-file self-contained executable for Windows x64
Write-Host "`nPublishing ZograhaIdleSetup.exe..." -ForegroundColor Yellow
$PublishDir = Join-Path $ProjectDir "bin\$Configuration\net8.0\win-x64\publish"

& dotnet publish "$ProjectDir" `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true

if ($LASTEXITCODE -ne 0) {
    Write-Error "dotnet publish failed."
    exit $LASTEXITCODE
}

$BuiltExe = Join-Path $PublishDir "ZograhaIdleSetup.exe"
if (-not (Test-Path $BuiltExe)) {
    Write-Error "Expected build artifact not found at $BuiltExe."
    exit 1
}

# 4. Copy to frontend/public/downloads/
if (-not (Test-Path $FrontendPublicDownloads)) {
    New-Item -ItemType Directory -Path $FrontendPublicDownloads -Force | Out-Null
}

$DestinationExe = Join-Path $FrontendPublicDownloads "ZograhaIdleSetup.exe"
Copy-Item -Path $BuiltExe -Destination $DestinationExe -Force

Write-Host "`nSuccessfully built and deployed installer to:" -ForegroundColor Green
Write-Host "  $DestinationExe" -ForegroundColor Green


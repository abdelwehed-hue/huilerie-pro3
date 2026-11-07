# Read-only preflight for the Oro Verde Windows local runtime.
# Run from the repository root after installing Python, Node.js, and MongoDB Shell.
# This script does not install software, change MongoDB, or start application services.
param(
  [string]$EnvPath = ".\\backend\\.env"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. $InstallHint"
  }
}

$repoRoot = (Get-Location).Path
$resolvedEnv = Resolve-Path -LiteralPath $EnvPath -ErrorAction SilentlyContinue
if (-not $resolvedEnv) {
  throw "Missing $EnvPath. Copy deploy\\windows\\backend.env.example to backend\\.env and configure it first."
}

# Reuse the stricter isolation/secret checks before any runtime probe.
& powershell -NoProfile -ExecutionPolicy Bypass -File ".\\deploy\\windows\\Test-LocalConfig.ps1" -EnvPath $resolvedEnv.Path
if ($LASTEXITCODE -ne 0) { throw "Local configuration validation failed." }

Require-Command "python" "Install Python 3.11+ and add it to PATH."
Require-Command "node" "Install the current Node.js LTS release and add it to PATH."
Require-Command "npm" "Install Node.js LTS (npm is included)."
Require-Command "mongosh" "Install MongoDB Shell and add mongosh.exe to PATH."
Require-Command "mongodump" "Install MongoDB Database Tools and add mongodump.exe to PATH."
Require-Command "mongorestore" "Install MongoDB Database Tools and add mongorestore.exe to PATH."

$values = @{}
Get-Content -LiteralPath $resolvedEnv.Path | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line -split "=", 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
}
$mongoUrl = $values["MONGO_URL"]
if ($mongoUrl -notmatch "(^|[?&])replicaSet=rs0(&|$)") {
  throw "MONGO_URL must include replicaSet=rs0 because this application uses MongoDB transactions."
}

Write-Host "Checking local MongoDB replica-set primary..." -ForegroundColor Cyan
$eval = 'const s = rs.status(); print(JSON.stringify({set: s.set, state: s.myState, primary: s.members?.some(m => m.stateStr === "PRIMARY")}));'
$mongoOutput = & mongosh $mongoUrl --quiet --eval $eval 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Could not read replica-set status. Start the local MongoDB service and initialize replica set rs0. Details: $mongoOutput"
}
try {
  $status = ($mongoOutput | Out-String | ConvertFrom-Json)
} catch {
  $rawOutput = $mongoOutput | Out-String
  $jsonLine = [regex]::Matches($rawOutput, "(?m)^\s*\{.*\}\s*$") | Select-Object -Last 1
  if (-not $jsonLine) { throw "mongosh returned an unexpected status response: $rawOutput" }
  try { $status = $jsonLine.Value | ConvertFrom-Json } catch { throw "Could not parse replica-set status: $rawOutput" }
}
if ($status.set -ne "rs0" -or $status.state -ne 1 -or -not $status.primary) {
  throw "MongoDB is reachable but is not a PRIMARY in replica set rs0. Returned: $($mongoOutput | Out-String)"
}

Write-Host "Preflight passed: required tools are available, local config is isolated, and MongoDB rs0 has a PRIMARY." -ForegroundColor Green
Write-Host "This does not yet validate frontend build, backend dependencies, browser cookies, LAN access, or WebSocket behavior." -ForegroundColor Yellow

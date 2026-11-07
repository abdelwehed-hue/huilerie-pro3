# Validate a local backend .env before starting Oro Verde.
# Usage: powershell -ExecutionPolicy Bypass -File .\deploy\windows\Test-LocalConfig.ps1 -EnvPath .\backend\.env
param(
  [Parameter(Mandatory=$true)][string]$EnvPath
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $EnvPath)) { throw "Missing environment file: $EnvPath" }
$values = @{}
Get-Content -LiteralPath $EnvPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line -split "=", 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
}
foreach ($key in @("MONGO_URL", "DB_NAME", "JWT_SECRET", "CORS_ORIGINS")) {
  if (-not $values.ContainsKey($key) -or -not $values[$key]) { throw "Missing required setting: $key" }
}
if ($values["MONGO_URL"] -match "mongodb\+srv://|mongodb\.net") {
  throw "This local profile must not point to MongoDB Atlas or a remote SRV cluster."
}
if ($values["MONGO_URL"] -notmatch "127\.0\.0\.1|localhost") {
  throw "MONGO_URL must point to this Windows machine for the local-only profile."
}
if ($values["DB_NAME"] -ne "oroverde_local") {
  throw "Expected isolated local database name oroverde_local; got $($values['DB_NAME'])."
}
if ($values["JWT_SECRET"] -match "REPLACE|CHANGE_ME|YOUR_") -or $values["JWT_SECRET"].Length -lt 32 {
  throw "JWT_SECRET must be replaced with a random secret of at least 32 characters."
}
if ($values["AUTH_DISABLED"] -match "^(1|true|yes|on)$") {
  throw "AUTH_DISABLED must remain false; public access is prohibited."
}
if ($values["CORS_ORIGINS"] -match "\*") {
  throw "CORS_ORIGINS cannot contain wildcard origins."
}
Write-Host "Local configuration checks passed. This does not verify MongoDB replica-set readiness or browser/WebSocket behavior." -ForegroundColor Green

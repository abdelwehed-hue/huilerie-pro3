param([Parameter(Mandatory=$true)][string]$EnvPath)
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
foreach ($key in @("APP_ENV","MONGO_URL","DB_NAME","JWT_SECRET","CORS_ORIGINS","AUTH_DISABLED","SERVE_FRONTEND","COOKIE_SECURE","COOKIE_SAMESITE")) {
  if (-not $values.ContainsKey($key) -or -not $values[$key]) { throw "Missing required setting: $key" }
}
if ($values["APP_ENV"] -ne "production") { throw "APP_ENV must be production locally so known demo accounts are never seeded." }
if ($values["MONGO_URL"] -match "mongodb\+srv://|mongodb\.net") { throw "Remote/Atlas MongoDB URLs are prohibited in this local profile." }
if ($values["MONGO_URL"] -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost):27017(?:/|\?|$)") { throw "MONGO_URL must point to this Windows machine." }
if ($values["DB_NAME"] -ne "oroverde_local") { throw "Expected isolated database oroverde_local." }
if ($values["JWT_SECRET"] -match "REPLACE|CHANGE_ME|YOUR_" -or $values["JWT_SECRET"].Length -lt 32) { throw "JWT_SECRET must be a random secret of at least 32 characters." }
if ($values["AUTH_DISABLED"] -match "^(1|true|yes|on)$") { throw "AUTH_DISABLED must remain false." }
if ($values["SERVE_FRONTEND"] -notmatch "^(1|true|yes|on)$") { throw "SERVE_FRONTEND=true is required." }
if ($values["CORS_ORIGINS"] -match "\*") { throw "CORS_ORIGINS cannot contain wildcard origins." }
if ($values["COOKIE_SAMESITE"] -notin @("lax","strict","none")) { throw "COOKIE_SAMESITE must be lax, strict, or none." }
if ($values["COOKIE_SAMESITE"] -eq "none" -and $values["COOKIE_SECURE"] -notmatch "^(1|true|yes|on)$") { throw "SameSite=None requires COOKIE_SECURE=true." }
$hasAdminUsername = $values.ContainsKey("INITIAL_ADMIN_USERNAME") -and [bool]$values["INITIAL_ADMIN_USERNAME"]
$hasAdminPassword = $values.ContainsKey("INITIAL_ADMIN_PASSWORD") -and [bool]$values["INITIAL_ADMIN_PASSWORD"]
if ($hasAdminUsername -xor $hasAdminPassword) { throw "Set both INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD, or remove both after the first admin account has been created." }
if ($hasAdminUsername) {
  if ($values["INITIAL_ADMIN_USERNAME"] -match "REPLACE|admin|administrator" -or $values["INITIAL_ADMIN_USERNAME"].Length -lt 4) { throw "Set a unique non-default INITIAL_ADMIN_USERNAME (at least 4 characters)." }
  if ($values["INITIAL_ADMIN_PASSWORD"] -match "REPLACE|CHANGE_ME|YOUR_" -or $values["INITIAL_ADMIN_PASSWORD"].Length -lt 16) { throw "Set a unique INITIAL_ADMIN_PASSWORD of at least 16 characters." }
}
Write-Host "Local configuration passed: isolated DB and production authentication." -ForegroundColor Green

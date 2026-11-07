param(
  [int]$Port = 8000,
  [string]$EnvPath = ".\backend\.env"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $EnvPath)) { throw "Missing backend .env." }
if (-not (Get-Command mongosh -ErrorAction SilentlyContinue)) { throw "mongosh is required." }

$values = @{}
Get-Content -LiteralPath $EnvPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line -split "=", 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
}
$uri = $values["MONGO_URL"]
$dbName = $values["DB_NAME"]
if ($dbName -ne "oroverde_local" -or $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost)(?::27017)?(?:/|\?|$)" -or $uri -match "mongodb\+srv://|mongodb\.net") {
  throw "Refusing persistence test unless the target is the isolated local oroverde_local database."
}

$marker = [guid]::NewGuid().ToString("N")
$collection = "_oroverde_runtime_smoke"
$insertEval = "const c=db.getSiblingDB('oroverde_local').getCollection('$collection'); c.insertOne({_id:'$marker',createdAt:new Date(),purpose:'restart-persistence-smoke'}); print('MARKER_WRITTEN');"
$verifyEval = "const d=db.getSiblingDB('oroverde_local').getCollection('$collection').findOne({_id:'$marker'}); print(d ? 'MARKER_FOUND' : 'MARKER_MISSING');"
$deleteEval = "const r=db.getSiblingDB('oroverde_local').getCollection('$collection').deleteOne({_id:'$marker'}); print('MARKER_CLEANED');"

function Invoke-MongoEval([string]$Eval) {
  $output = & mongosh $uri --quiet --eval $Eval 2>&1
  if ($LASTEXITCODE -ne 0) { throw "mongosh operation failed: $output" }
  return ($output | Out-String)
}

$health = $null
try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/" -TimeoutSec 5 -UseBasicParsing
} catch {
  throw "Oro Verde must already be running on port $Port before the persistence test."
}
if ($health.StatusCode -ne 200) { throw "Local API is not healthy; refusing persistence test." }

$insertResult = Invoke-MongoEval $insertEval
if ($insertResult -notmatch "MARKER_WRITTEN") { throw "Could not confirm persistence marker insertion." }

$stopScript = Join-Path $PSScriptRoot "Stop-OroVerde.ps1"
$startScript = Join-Path $PSScriptRoot "Start-OroVerde.ps1"
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $stopScript
  if ($LASTEXITCODE -ne 0) { throw "Could not stop Oro Verde cleanly." }

  & powershell -NoProfile -ExecutionPolicy Bypass -File $startScript -Port $Port
  if ($LASTEXITCODE -ne 0) { throw "Oro Verde did not restart successfully. Review deploy\\windows\\runtime logs." }

  $verifyResult = Invoke-MongoEval $verifyEval
  if ($verifyResult -notmatch "MARKER_FOUND") {
    throw "Persistence test failed: the marker was not found after backend restart."
  }
  Write-Host "Persistence test passed: a local database record survived backend stop and restart." -ForegroundColor Green
}
finally {
  try { Invoke-MongoEval $deleteEval | Out-Null } catch { Write-Warning "Could not remove the temporary smoke-test marker. Collection: $collection; marker: $marker" }
}
Write-Host "This verifies backend restart persistence, not a full Windows reboot, disk failure recovery, or backup restoration." -ForegroundColor Yellow

# One-time initialization for a local single-node MongoDB replica set.
param(
  [string]$EnvPath = ".\\backend\\.env",
  [string]$ServiceName = "MongoDB",
  [int]$WaitSeconds = 60
)
$ErrorActionPreference = "Stop"
if ($WaitSeconds -lt 10 -or $WaitSeconds -gt 300) { throw "WaitSeconds must be between 10 and 300." }
if (-not (Test-Path -LiteralPath $EnvPath)) { throw "Missing backend .env." }
$values = @{}
Get-Content -LiteralPath $EnvPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line -split "=", 2
    $values[$parts[0].Trim()] = $parts[1].Trim()
  }
}
$uri = $values["MONGO_URL"]
if (-not $uri -or $uri -match "mongodb\\+srv://|mongodb\\.net" -or
    $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\\.0\\.0\\.1|localhost)(?::27017)?(?:/|\\?|$)") {
  throw "Refusing to initialize anything except a local MongoDB instance."
}
try { $mongoUri = [System.Uri]::new($uri) } catch { throw "MONGO_URL is not a valid MongoDB URI." }
if ($mongoUri.Scheme -ne "mongodb" -or $mongoUri.Host -notin @("127.0.0.1", "localhost") -or $mongoUri.Port -ne 27017) {
  throw "This bootstrap currently supports only local MongoDB on port 27017."
}
if ($uri -notmatch "(^|[?&])replicaSet=rs0(&|$)") { throw "MONGO_URL must specify replicaSet=rs0." }
if (-not (Get-Command mongosh -ErrorAction SilentlyContinue)) { throw "Install MongoDB Shell (mongosh) first." }

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) { throw "MongoDB Windows service '$ServiceName' was not found. Install MongoDB Community Server as a Windows service first." }
if ($service.Status -ne "Running") {
  Write-Host "Starting MongoDB Windows service '$ServiceName'..." -ForegroundColor Cyan
  Start-Service -Name $ServiceName
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$reachable = $false
do {
  $ping = & mongosh "mongodb://127.0.0.1:27017/" --quiet --eval 'db.adminCommand({ping:1}).ok' 2>&1
  if ($LASTEXITCODE -eq 0 -and (($ping | Out-String) -match "(?m)^\\s*1\\s*$")) { $reachable = $true; break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $reachable) { throw "MongoDB service did not accept local connections within $WaitSeconds seconds. Details: $ping" }

$eval = @'
try {
  const s = rs.status();
  if (s.set === "rs0") { print("Replica set rs0 is already initialized."); quit(0); }
} catch (e) {
  if (e.codeName !== "NotYetInitialized" && e.code !== 94) { print(e); quit(2); }
}
const r = rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]});
printjson(r);
'@
$out = & mongosh "mongodb://127.0.0.1:27017/" --quiet --eval $eval 2>&1
if ($LASTEXITCODE -ne 0) { throw "Replica-set initialization failed: $out" }

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$primary = $false
do {
  $statusEval = 'const s=rs.status(); print(JSON.stringify({set:s.set,state:s.myState,primary:s.members?.some(m=>m.stateStr==="PRIMARY")}));'
  $statusOutput = & mongosh "mongodb://127.0.0.1:27017/?replicaSet=rs0" --quiet --eval $statusEval 2>&1
  if ($LASTEXITCODE -eq 0) {
    $raw = $statusOutput | Out-String
    $jsonLine = [regex]::Matches($raw, "(?m)^\\s*\\{.*\\}\\s*$") | Select-Object -Last 1
    if ($jsonLine) {
      $status = $jsonLine.Value | ConvertFrom-Json
      if ($status.set -eq "rs0" -and $status.state -eq 1 -and $status.primary) { $primary = $true; break }
    }
  }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $primary) { throw "MongoDB did not elect a PRIMARY in replica set rs0 within $WaitSeconds seconds. Details: $statusOutput" }

Write-Host "Local MongoDB service is running and replica set rs0 has a PRIMARY." -ForegroundColor Green
Write-Host "This script does not install MongoDB or alter firewall/network settings." -ForegroundColor Yellow

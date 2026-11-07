param(
  [string]$EnvPath = ".\backend\.env",
  [string]$ServiceName = "MongoDB",
  [int]$WaitSeconds = 60
)

$ErrorActionPreference = "Stop"
if ($WaitSeconds -lt 10 -or $WaitSeconds -gt 300) { throw "WaitSeconds must be between 10 and 300." }
if (-not (Test-Path -LiteralPath $EnvPath)) { throw "Missing backend .env." }
if (-not (Get-Command mongosh -ErrorAction SilentlyContinue)) { throw "mongosh is required; install MongoDB Shell first." }

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
if ($dbName -ne "oroverde_local" -or
    $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost)(?::27017)?(?:/|\?|$)" -or
    $uri -match "mongodb\+srv://|mongodb\.net" -or
    $uri -notmatch "(^|[?&])replicaSet=rs0(&|$)") {
  throw "Refusing to start MongoDB unless backend/.env targets local oroverde_local with replicaSet=rs0."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  throw "MongoDB Windows service '$ServiceName' was not found. Install MongoDB Community Server as a Windows service; this script does not install or reconfigure it."
}
if ($service.Status -ne "Running") {
  Write-Host "Starting MongoDB Windows service '$ServiceName'..." -ForegroundColor Cyan
  try { Start-Service -Name $ServiceName } catch { throw "Could not start MongoDB service '$ServiceName'. Check Windows service permissions or run the launcher with an authorized account. Details: $($_.Exception.Message)" }
}

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$lastOutput = ""
do {
  try {
    $eval = 'const s=rs.status(); print(JSON.stringify({set:s.set,state:s.myState,primary:s.members?.some(m=>m.stateStr==="PRIMARY")}));'
    $output = & mongosh $uri --quiet --eval $eval 2>&1
    if ($LASTEXITCODE -eq 0) {
      $lastOutput = $output | Out-String
      $jsonLine = [regex]::Matches($lastOutput, "(?m)^\s*\{.*\}\s*$") | Select-Object -Last 1
      if ($jsonLine) {
        $status = $jsonLine.Value | ConvertFrom-Json
        if ($status.set -eq "rs0" -and $status.state -eq 1 -and $status.primary) {
          Write-Host "MongoDB service is running and replica set rs0 has a PRIMARY." -ForegroundColor Green
          exit 0
        }
      }
    } else {
      $lastOutput = $output | Out-String
    }
  } catch {
    $lastOutput = $_.Exception.Message
  }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

throw "MongoDB service did not become PRIMARY in replica set rs0 within $WaitSeconds seconds. Details: $lastOutput"

param(
  [string]$EnvPath = ".\backend\.env",
  [string]$BackupDirectory = ".\backups"
)

$ErrorActionPreference = "Stop"
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  throw "Oro Verde is listening on port 8000. Stop the application before verifying backup restoration."
}
if (-not (Test-Path -LiteralPath $EnvPath)) { throw "Missing backend .env." }
foreach ($tool in @("mongosh", "mongorestore")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required." }
}

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
    $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost):27017(?:/|\?|$)" -or
    $uri -match "mongodb\+srv://|mongodb\.net") {
  throw "Refusing backup-restore verification unless the target is local oroverde_local."
}

$backupScript = Join-Path $PSScriptRoot "Backup-LocalDatabase.ps1"
& powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript -EnvPath $EnvPath -BackupDirectory $BackupDirectory
if ($LASTEXITCODE -ne 0) { throw "Backup creation failed; restore verification was not attempted." }

$archive = Get-ChildItem -LiteralPath $BackupDirectory -Filter "oroverde_local-*.archive.gz" -File |
  Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $archive) { throw "No backup archive was produced." }
$checksumFile = "$($archive.FullName).sha256"
if (-not (Test-Path -LiteralPath $checksumFile)) { throw "Backup checksum file is missing." }
$expectedHash = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split "\s+")[0].ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
if ($expectedHash -notmatch "^[A-F0-9]{64}$" -or $expectedHash -ne $actualHash) {
  throw "Backup SHA-256 verification failed."
}

$verifyDb = "oroverde_restore_verify_$([guid]::NewGuid().ToString('N').Substring(0,12))"
$restoreArgs = @(
  "--uri=$uri",
  "--archive=$($archive.FullName)",
  "--gzip",
  "--nsInclude=$dbName.*",
  "--nsFrom=$dbName.*",
  "--nsTo=$verifyDb.*"
)
$createdVerifyDb = $true
try {
  # Mark for cleanup before invoking mongorestore: a failed import may still have
  # created the temporary database and some collections.
  & mongorestore @restoreArgs
  if ($LASTEXITCODE -ne 0) { throw "Restoring the archive into the temporary verification database failed." }

  $eval = @"
const source = db.getSiblingDB('$dbName');
const restored = db.getSiblingDB('$verifyDb');
function snapshot(d) {
  return d.getCollectionInfos({type:'collection'})
    .map(x => ({name:x.name, count:d.getCollection(x.name).countDocuments({})}))
    .sort((a,b) => a.name.localeCompare(b.name));
}
print(JSON.stringify({source:snapshot(source), restored:snapshot(restored)}));
"@
  $jsonOutput = & mongosh $uri --quiet --eval $eval 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Could not compare source and restored collection counts: $jsonOutput" }
  $jsonLine = ($jsonOutput | Where-Object { "$_".Trim().StartsWith("{") } | Select-Object -Last 1)
  if (-not $jsonLine) { throw "MongoDB did not return the collection comparison result: $jsonOutput" }
  $comparison = "$jsonLine" | ConvertFrom-Json
  $sourceJson = ConvertTo-Json -InputObject @($comparison.source) -Depth 8 -Compress
  $restoredJson = ConvertTo-Json -InputObject @($comparison.restored) -Depth 8 -Compress
  if ($sourceJson -cne $restoredJson) {
    throw "Restore verification failed: collection names or document counts differ. Source=$sourceJson Restored=$restoredJson"
  }

  Write-Host "Backup/restore verification passed: the archive was restored into a separate temporary database and collection counts match." -ForegroundColor Green
  Write-Host "Verified archive: $($archive.FullName)"
}
finally {
  if ($createdVerifyDb) {
    $cleanup = "db.getSiblingDB('$verifyDb').dropDatabase(); print('VERIFY_DB_DROPPED');"
    $cleanupOutput = & mongosh $uri --quiet --eval $cleanup 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not remove temporary verification database $verifyDb. Manual cleanup is required. Details: $cleanupOutput"
    } else {
      Write-Host "Temporary verification database removed."
    }
  }
}
Write-Warning "This verifies archive restoration and collection counts, not full record-by-record equivalence or recovery from disk failure."

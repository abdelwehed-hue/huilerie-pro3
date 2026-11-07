param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [string]$EnvPath = ".\backend\.env",
 [switch]$DropTarget,
 [int]$Port = 8000
)
$ErrorActionPreference = "Stop"
# Never restore while the application can still write to the target database.
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
 throw "A process is listening on local port $Port. Stop Oro Verde before restoring."
}
if(-not(Test-Path $EnvPath)){ throw "Missing backend .env." }
if(-not(Test-Path $Archive)){ throw "Backup archive not found: $Archive" }
if(-not(Get-Command mongorestore -ErrorAction SilentlyContinue)){ throw "mongorestore is required; install MongoDB Database Tools." }
$values=@{}
Get-Content $EnvPath | ForEach-Object { $line=$_.Trim(); if($line -and -not $line.StartsWith("#") -and $line.Contains("=")){ $p=$line -split "=",2; $values[$p[0].Trim()]=$p[1].Trim() } }
$uri=$values["MONGO_URL"]; $db=$values["DB_NAME"]
if(-not $uri -or $uri -match "mongodb\+srv://|mongodb\.net" -or $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost)(?::27017)?(?:/|\?|$)"){ throw "Refusing restore unless MongoDB URL is local." }
if($db -ne "oroverde_local"){ throw "Refusing restore: DB_NAME must be oroverde_local." }
$archivePath=(Resolve-Path $Archive).Path
$checksumFile="$archivePath.sha256"
if(-not(Test-Path $checksumFile)){ throw "Backup checksum sidecar is missing: $checksumFile" }
$expected=((Get-Content $checksumFile -Raw).Trim() -split "\s+")[0].ToUpperInvariant()
$actual=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToUpperInvariant()
if($expected -notmatch "^[A-F0-9]{64}$" -or $expected -ne $actual){ throw "Backup SHA-256 verification failed or checksum file is malformed; refusing restore." }
Write-Host "Backup SHA-256 verified." -ForegroundColor Green
$dryRunOutput = & mongorestore --dryRun --uri="$uri" --archive="$archivePath" --gzip --nsInclude="$db.*" 2>&1
if($LASTEXITCODE -ne 0){ throw "Backup archive validation failed; no restore was attempted. Details: $dryRunOutput" }
Write-Host "Backup archive structure validated." -ForegroundColor Green
if($DropTarget){
 $confirmation=Read-Host "This will replace data in LOCAL database oroverde_local. Type RESTORE-OROVERDE-LOCAL to continue"
 if($confirmation -cne "RESTORE-OROVERDE-LOCAL"){ throw "Restore cancelled." }
}
$argsList=@("--uri=$uri","--archive=$archivePath","--gzip","--nsInclude=$db.*")
if($DropTarget){ $argsList += "--drop" }
& mongorestore @argsList
if($LASTEXITCODE -ne 0){ throw "mongorestore failed. Inspect output before retrying." }
Write-Host "Restore command completed for local database $db." -ForegroundColor Green
if(-not $DropTarget){ Write-Warning "Restore ran without --drop; existing documents not present in the archive may remain. Use -DropTarget only after a verified backup and explicit approval." }

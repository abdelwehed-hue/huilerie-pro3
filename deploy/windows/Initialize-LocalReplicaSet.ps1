# One-time initialization for a local single-node MongoDB replica set.
param([string]$EnvPath = ".\backend\.env")
$ErrorActionPreference = "Stop"
if (-not (Test-Path $EnvPath)) { throw "Missing backend .env." }
$values = @{}
Get-Content $EnvPath | ForEach-Object {
  $line=$_.Trim()
  if($line -and -not $line.StartsWith("#") -and $line.Contains("=")){ $p=$line -split "=",2; $values[$p[0].Trim()]=$p[1].Trim() }
}
$uri=$values["MONGO_URL"]
if(-not $uri -or $uri -match "mongodb\+srv://|mongodb\.net" -or $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost)(?::27017)?(?:/|\?|$)"){ throw "Refusing to initialize anything except a local MongoDB instance." }
try { $mongoUri = [System.Uri]::new($uri) } catch { throw "MONGO_URL is not a valid MongoDB URI." }
if($mongoUri.Scheme -ne "mongodb" -or $mongoUri.Host -notin @("127.0.0.1","localhost") -or $mongoUri.Port -ne 27017){ throw "This bootstrap currently supports only local MongoDB on port 27017." }
if($uri -notmatch "(^|[?&])replicaSet=rs0(&|$)"){ throw "MONGO_URL must specify replicaSet=rs0." }
if(-not (Get-Command mongosh -ErrorAction SilentlyContinue)){ throw "Install MongoDB Shell (mongosh) first." }
$eval='try { const s=rs.status(); if(s.set==="rs0") { print("Replica set rs0 is already initialized."); quit(0); } } catch(e) { if(e.codeName!=="NotYetInitialized" && e.code!==94) { print(e); quit(2); } } const r=rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}); printjson(r);'
$out=& mongosh "mongodb://127.0.0.1:27017/" --quiet --eval $eval 2>&1
if($LASTEXITCODE -ne 0){ throw "Replica-set initialization failed: $out" }
Write-Host "Initialization requested. Wait for MongoDB to elect PRIMARY, then run Test-LocalRuntime.ps1." -ForegroundColor Green
Write-Host "This script does not install MongoDB or alter firewall/network settings." -ForegroundColor Yellow

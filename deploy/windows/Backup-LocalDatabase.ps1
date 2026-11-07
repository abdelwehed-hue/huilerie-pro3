param(
 [string]$EnvPath = ".\backend\.env",
 [string]$BackupDirectory = ".\backups"
)
$ErrorActionPreference = "Stop"
if(-not(Test-Path $EnvPath)){ throw "Missing backend .env." }
if(-not(Get-Command mongodump -ErrorAction SilentlyContinue)){ throw "mongodump is required; install MongoDB Database Tools." }
$values=@{}
Get-Content $EnvPath | ForEach-Object { $line=$_.Trim(); if($line -and -not $line.StartsWith("#") -and $line.Contains("=")){ $p=$line -split "=",2; $values[$p[0].Trim()]=$p[1].Trim() } }
$uri=$values["MONGO_URL"]; $db=$values["DB_NAME"]
if(-not $uri -or $uri -match "mongodb\+srv://|mongodb\.net" -or $uri -notmatch "^mongodb://(?:[^/@]+@)?(?:127\.0\.0\.1|localhost)(?::27017)?(?:/|\?|$)"){ throw "Refusing backup unless MongoDB URL is local." }
if($db -ne "oroverde_local"){ throw "Refusing backup: DB_NAME must be oroverde_local." }
$dir=[System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$file=Join-Path $dir "oroverde_local-$stamp.archive.gz"
& mongodump --uri="$uri" --db="$db" --archive="$file" --gzip
if($LASTEXITCODE -ne 0){ Remove-Item $file -Force -ErrorAction SilentlyContinue; throw "mongodump failed." }
$hash=Get-FileHash -LiteralPath $file -Algorithm SHA256
Set-Content -LiteralPath "$file.sha256" -Value "$($hash.Hash)  $(Split-Path $file -Leaf)"
Write-Host "Backup created: $file" -ForegroundColor Green
Write-Host "SHA256: $($hash.Hash)"

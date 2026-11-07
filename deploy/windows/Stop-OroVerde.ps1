$ErrorActionPreference = "Stop"
$pidFile = Join-Path $PSScriptRoot "runtime\backend.pid"
if (-not (Test-Path $pidFile)) { Write-Host "No Oro Verde PID file found; nothing to stop."; exit 0 }
$processId = 0
if (-not [int]::TryParse((Get-Content $pidFile -Raw).Trim(), [ref]$processId) -or $processId -le 0) { throw "PID file is invalid. Inspect $pidFile." }
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
if (-not $proc) { Remove-Item $pidFile -Force; Write-Host "Stale PID file removed."; exit 0 }
if ($proc.CommandLine -notmatch "uvicorn server:app" -or $proc.CommandLine -notmatch "--port\s+\d+") { throw "Refusing to stop PID $processId: command line does not match Oro Verde." }
Stop-Process -Id $processId -Force
Remove-Item $pidFile -Force
Write-Host "Oro Verde backend stopped." -ForegroundColor Green

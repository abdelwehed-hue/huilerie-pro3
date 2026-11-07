param([int]$Port = 8000)
$ErrorActionPreference = "Stop"
if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535." }
$pidFile = Join-Path $PSScriptRoot "runtime\backend.pid"
if (-not (Test-Path $pidFile)) { Write-Host "No Oro Verde PID file found; nothing to stop."; exit 0 }
$processId = 0
if (-not [int]::TryParse((Get-Content $pidFile -Raw).Trim(), [ref]$processId) -or $processId -le 0) { throw "PID file is invalid. Inspect $pidFile." }
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
if (-not $proc) { Remove-Item $pidFile -Force; Write-Host "Stale PID file removed."; exit 0 }
$commandLine = [string]$proc.CommandLine
$expectedPort = "--port\s+$Port(?:\s|$)"
if ($commandLine -notmatch "uvicorn\s+server:app(?:\s|$)" -or
    $commandLine -notmatch "--host\s+127\.0\.0\.1(?:\s|$)" -or
    $commandLine -notmatch $expectedPort) {
  throw "Refusing to stop PID ${processId}: command line does not match Oro Verde on localhost port $Port."
}
Stop-Process -Id $processId -Force
Remove-Item $pidFile -Force
Write-Host "Oro Verde backend stopped on port $Port." -ForegroundColor Green

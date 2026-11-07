param([int]$Port = 8000)
$ErrorActionPreference = "Stop"
if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535." }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot
$envPath = Join-Path $repoRoot "backend\.env"
$python = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
$distIndex = Join-Path $repoRoot "frontend\dist\index.html"
$runtimeDir = Join-Path $PSScriptRoot "runtime"
$pidFile = Join-Path $runtimeDir "backend.pid"
$stdout = Join-Path $runtimeDir "backend.out.log"
$stderr = Join-Path $runtimeDir "backend.err.log"
if (-not (Test-Path $envPath)) { throw "Missing backend\.env. Configure it before startup." }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Test-LocalConfig.ps1") -EnvPath $envPath
if ($LASTEXITCODE -ne 0) { throw "Local configuration validation failed; backend was not started." }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Start-LocalMongoDB.ps1") -EnvPath $envPath
if ($LASTEXITCODE -ne 0) { throw "Local MongoDB service is not ready; Oro Verde was not started." }
if (-not (Test-Path $python)) { throw "Backend environment missing. Run Setup-Backend.ps1 first." }
if (-not (Test-Path $distIndex)) { throw "Frontend build missing. Run Build-LocalFrontend.ps1 first." }
if (-not (Test-Path $runtimeDir)) { New-Item -ItemType Directory -Path $runtimeDir | Out-Null }
if (Test-Path $pidFile) {
  $existingPid = 0
  [void][int]::TryParse((Get-Content $pidFile -Raw).Trim(), [ref]$existingPid)
  if ($existingPid -gt 0 -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    try {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$existingPid"
      $commandLine = [string]$proc.CommandLine
      $expectedPort = "--port\\s+$Port(?:\\s|$)"
      if ($commandLine -match "uvicorn\\s+server:app(?:\\s|$)" -and
          $commandLine -match "--host\\s+127\\.0\\.0\\.1(?:\\s|$)" -and
          $commandLine -match $expectedPort) {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/" -TimeoutSec 2 -UseBasicParsing
        if ($health.StatusCode -eq 200) { Start-Process "http://127.0.0.1:$Port"; Write-Host "Oro Verde is already running."; exit 0 }
      }
    } catch { }
    throw "PID file exists but process cannot be safely verified. Inspect $pidFile."
  }
  Remove-Item $pidFile -Force
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use. Stop the other service or choose another port." }
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "Test-LocalRuntime.ps1") -EnvPath $envPath
if ($LASTEXITCODE -ne 0) { throw "Runtime preflight failed; backend was not started." }
$process = Start-Process -FilePath $python -ArgumentList @("-m","uvicorn","server:app","--host","127.0.0.1","--port",$Port.ToString()) -WorkingDirectory (Join-Path $repoRoot "backend") -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
$ready = $false
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if ($process.HasExited) { break }
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/" -TimeoutSec 2 -UseBasicParsing
    if ($response.StatusCode -eq 200 -and -not $process.HasExited) { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  throw "Oro Verde did not become healthy. Review $stderr and $stdout."
}
Start-Process "http://127.0.0.1:$Port"
Write-Host "Oro Verde running on port $Port. This bootstrap listens on localhost only; LAN access is deliberately disabled until HTTPS and firewall configuration are implemented." -ForegroundColor Green
Write-Host "Stop with Stop-OroVerde.ps1. Do not expose this port to Public networks or the internet." -ForegroundColor Yellow

$ErrorActionPreference = "Stop"
$repoRoot = (Get-Location).Path
$backendDir = Join-Path $repoRoot "backend"
if (-not (Test-Path (Join-Path $backendDir "requirements.txt"))) { throw "Run this script from the repository root." }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "Python 3.11+ is required and must be on PATH." }
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,11) else 1)"
if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or newer is required." }
Push-Location $backendDir
try {
  if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create backend virtual environment." }
  }
  & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }
  & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
  if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
  Write-Host "Backend environment installed in backend\.venv." -ForegroundColor Green
}
finally { Pop-Location }

# Build the frontend for a same-origin local Windows deployment.
# This repository currently has no package-lock.json; npm resolves the pinned manifest dependencies.
# Run from the repository root after Node.js LTS is installed.
$ErrorActionPreference = "Stop"
$frontendDir = Join-Path (Get-Location) "frontend"
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
  throw "frontend/package.json is missing; run this script from the repository root."
}
Push-Location $frontendDir
try {
  $env:VITE_API_SAME_ORIGIN = "true"
  Remove-Item Env:VITE_API_ORIGIN -ErrorAction SilentlyContinue
  npm install --legacy-peer-deps --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
  if (-not (Test-Path ".\dist\index.html")) { throw "Build completed but dist/index.html was not created." }
  Write-Host "Local frontend build ready at frontend\dist. API calls and WebSocket use the same origin." -ForegroundColor Green
}
finally { Pop-Location }

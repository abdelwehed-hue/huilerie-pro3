param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$credential = Get-Credential -Message "Enter an Oro Verde administrator account for the local login smoke test."
if (-not $credential) { throw "Administrator credentials are required for this test." }
$username = $credential.UserName
$password = (New-Object System.Net.NetworkCredential("", $credential.Password)).Password

$base = "http://127.0.0.1:$Port"
$health = Invoke-RestMethod -Uri "$base/api/" -Method Get -TimeoutSec 10
if ($health.message -ne "Huilerie API") { throw "API health endpoint returned an unexpected payload." }

$home = Invoke-WebRequest -Uri "$base/" -Method Get -TimeoutSec 10 -UseBasicParsing
if ($home.StatusCode -ne 200 -or $home.Content -notmatch "<html") {
  throw "The local frontend root did not return an HTML application shell."
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = $username; password = $password } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session -TimeoutSec 10
if (-not $login.id -or -not ($session.Cookies.GetCookies([uri]$base) | Where-Object { $_.Name -eq "olive_session" })) {
  throw "Login did not establish the expected authenticated session cookie."
}

$me = Invoke-RestMethod -Uri "$base/api/auth/me" -Method Get -WebSession $session -TimeoutSec 10
if ($me.id -ne $login.id) { throw "Authenticated /me response does not match the logged-in account." }

$logout = Invoke-RestMethod -Uri "$base/api/auth/logout" -Method Post -WebSession $session -TimeoutSec 10
if (-not $logout.ok) { throw "Logout endpoint did not confirm success." }

$sessionRejected = $false
try {
  Invoke-RestMethod -Uri "$base/api/auth/me" -Method Get -WebSession $session -TimeoutSec 10 | Out-Null
} catch {
  $statusCode = 0
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }
  if ($statusCode -eq 401) { $sessionRejected = $true } else { throw }
}
if (-not $sessionRejected) { throw "The session remained authorized after logout; expected HTTP 401." }

Write-Host "Local HTTP smoke test passed: frontend, API, login, session cookie, /me, and logout." -ForegroundColor Green
Write-Host "This does not test WebSocket reconnects, concurrent clients, full business workflows, or backup/restore." -ForegroundColor Yellow

param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$credential = Get-Credential -Message "Enter an Oro Verde administrator account for the WebSocket test."
if (-not $credential) { throw "Administrator credentials are required for this test." }
$username = $credential.UserName
$password = (New-Object System.Net.NetworkCredential("", $credential.Password)).Password
$base = "http://127.0.0.1:$Port"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = $username; password = $password } | ConvertTo-Json -Compress
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -WebSession $session -TimeoutSec 10
if (-not $login.id) { throw "HTTP login failed; WebSocket test cannot continue." }

$cookie = $session.Cookies.GetCookies([uri]$base) | Where-Object { $_.Name -eq "olive_session" } | Select-Object -First 1
if (-not $cookie) { throw "Login did not establish the olive_session cookie." }

$socket = New-Object System.Net.WebSockets.ClientWebSocket
$socket.Options.SetRequestHeader("Cookie", "olive_session=$($cookie.Value)")
$socket.Options.SetRequestHeader("Origin", $base)
$wsUri = [uri]("ws://127.0.0.1:$Port/api/realtime")
$connected = $false
try {
  $socket.ConnectAsync($wsUri, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
    throw "WebSocket handshake completed without an Open connection."
  }
  $connected = $true

  $ping = [System.Text.Encoding]::UTF8.GetBytes("ping")
  $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList @(,$ping)
  $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  Start-Sleep -Seconds 2
  if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
    throw "WebSocket closed after receiving the client heartbeat."
  }

  $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "smoke test complete", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  Write-Host "Authenticated WebSocket test passed: origin, session cookie, handshake, heartbeat send, and stable connection." -ForegroundColor Green
  Write-Host "This does not simulate browser reconnect/backoff or verify cross-device data-change broadcasts." -ForegroundColor Yellow
}
finally {
  if ($socket) { $socket.Dispose() }
}

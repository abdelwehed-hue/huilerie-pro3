$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$launcher = Join-Path $PSScriptRoot "Start-OroVerde.ps1"
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Oro Verde Local.lnk"
$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "' + $launcher + '"')
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Start the local Oro Verde mill application"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$shortcut.Save()
Write-Host "Desktop shortcut created: $shortcutPath" -ForegroundColor Green

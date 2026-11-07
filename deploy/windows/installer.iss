#define AppName "Oro Verde"
#define AppVersion "1.0.0"
#define AppPublisher "Oro Verde"
#define AppExeName "OroVerde.exe"

[Setup]
AppId={{C1D5A3A2-7B2D-4F20-A2B4-6F20D8B4A910}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Oro Verde
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\release
OutputBaseFilename=OroVerde-Setup
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#AppExeName}
SetupLogging=yes
WizardStyle=modern

[Files]
Source: "..\..\backend\dist\OroVerdeBackend\*"; DestDir: "{app}\backend"; Flags: recursesubdirs ignoreversion
Source: "..\..\backend\dist\OroVerde.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: recursesubdirs ignoreversion
Source: "README.md"; DestDir: "{app}\docs"; Flags: ignoreversion
Source: "EXE-PACKAGING.md"; DestDir: "{app}\docs"; Flags: ignoreversion

[Icons]
Name: "{autodesktop}\Oro Verde"; Filename: "{app}\{#AppExeName}"
Name: "{autoprograms}\Oro Verde"; Filename: "{app}\{#AppExeName}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch Oro Verde"; Flags: postinstall nowait skipifsilent runasoriginaluser

[UninstallDelete]
; Intentionally do not remove the current user's %LOCALAPPDATA%\OroVerde folder.
; Local configuration, logs and backups must survive uninstall.

param(
    [ValidateSet('start', 'login', 'help', 'version')]
    [string]$Action = 'start',
    [ValidateRange(1, 65535)]
    [int]$Port = 18787
)
$ErrorActionPreference = 'Stop'
$taskBridgeRoot = Split-Path $PSScriptRoot -Parent
$taskCoreRoot = Join-Path $taskBridgeRoot 'core'
$taskDataRoot = Join-Path $taskBridgeRoot 'runtime/upstream'
$taskEnvironmentNames = @('HOST','PORT','DS_DATA_DIR','DS_AUTH_FILE','DS_API_KEY_FILE','DS_API_KEY','DS_SESSION_FILE','DS_CHROME_PROFILE','DS_BASE_URL','DS_DEBUG','DS_CDP')
$taskSavedEnvironment = @{}
foreach ($taskName in $taskEnvironmentNames) {
    $taskSavedEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}

try {
if ($Action -in @('start', 'login')) {
    New-Item -ItemType Directory -Path $taskDataRoot -Force | Out-Null
    $env:HOST = '127.0.0.1'
    $env:PORT = "$Port"
    $env:DS_DATA_DIR = $taskDataRoot
    $env:DS_AUTH_FILE = Join-Path $taskDataRoot 'auth.json'
    $env:DS_API_KEY_FILE = Join-Path $taskDataRoot '.api-key'
    $env:DS_API_KEY = ''
    $env:DS_SESSION_FILE = Join-Path $taskDataRoot 'sessions.json'
    $env:DS_CHROME_PROFILE = Join-Path $taskDataRoot 'chrome-profile'
    $env:DS_BASE_URL = 'https://chat.deepseek.com'
    $env:DS_DEBUG = 'false'
    # A fresh unused endpoint avoids attaching to an unrelated existing CDP browser.
    $taskListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $taskListener.Start()
    $taskDebugPort = $taskListener.LocalEndpoint.Port
    $taskListener.Stop()
    $env:DS_CDP = "http://127.0.0.1:$taskDebugPort"
}

Push-Location $taskCoreRoot
try {
    & node (Join-Path $taskCoreRoot 'dist/index.js') $Action
    if ($LASTEXITCODE -ne 0) { throw "Core exited with status $LASTEXITCODE" }
} finally { Pop-Location }
} finally {
    foreach ($taskName in $taskEnvironmentNames) {
        [Environment]::SetEnvironmentVariable($taskName, $taskSavedEnvironment[$taskName], 'Process')
    }
}

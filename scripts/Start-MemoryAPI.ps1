param(
    [Parameter(Mandatory = $true)]
    [string]$Project,
    [Parameter(Mandatory = $true)]
    [string]$Model,
    [ValidateRange(1, 65535)]
    [int]$Port = 8790,
    [ValidateRange(1, 65535)]
    [int]$UpstreamPort = 18787
)
$ErrorActionPreference = 'Stop'
$taskBridgeRoot = Split-Path $PSScriptRoot -Parent
$taskRuntimeRoot = Join-Path $taskBridgeRoot 'runtime'
$taskUpstreamKeyFile = Join-Path $taskRuntimeRoot 'upstream/.api-key'
$taskOriginalUpstreamKey = [Environment]::GetEnvironmentVariable('BRIDGE_UPSTREAM_KEY', 'Process')

try {
if (-not $env:BRIDGE_UPSTREAM_KEY) {
    if (-not (Test-Path -LiteralPath $taskUpstreamKeyFile)) {
        throw 'Start the bundled core and finish login before starting the memory API.'
    }
    $taskKeys = @([IO.File]::ReadAllLines($taskUpstreamKeyFile) | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') })
    if ($taskKeys.Count -eq 0) { throw 'The upstream key file is empty.' }
    $env:BRIDGE_UPSTREAM_KEY = $taskKeys[0].Trim()
}
if (-not $env:BRIDGE_API_KEY) {
    throw 'Set BRIDGE_API_KEY to a random key of at least 16 characters in this terminal first.'
}
& node (Join-Path $taskBridgeRoot 'src/cli.js') init --project $Project
if ($LASTEXITCODE -ne 0) { throw 'Project initialization failed.' }
& node (Join-Path $taskBridgeRoot 'src/cli.js') serve --project $Project --port $Port --base-url "http://127.0.0.1:$UpstreamPort/v1" --model $Model
if ($LASTEXITCODE -ne 0) { throw 'Memory API exited with an error.' }
} finally {
    [Environment]::SetEnvironmentVariable('BRIDGE_UPSTREAM_KEY', $taskOriginalUpstreamKey, 'Process')
}

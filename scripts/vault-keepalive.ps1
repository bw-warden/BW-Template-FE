# Keep the Bitwarden CLI vault session warm by hitting the app keepalive endpoint.
# Schedule with Task Scheduler every 3–5 minutes (see register-vault-keepalive-task.ps1),
# or call from cron:
#   curl -sS -H "Authorization: Bearer $SECRET" "http://127.0.0.1:3000/api/vault/keepalive?sync=1"
#
# Resolves secret from (first hit wins):
#   1) -Secret / VAULT_KEEPALIVE_SECRET
#   2) APP_SECRET
#   3) repo .env (VAULT_KEEPALIVE_SECRET or APP_SECRET)

param(
  [string]$Url = $env:VAULT_KEEPALIVE_URL,
  [string]$Secret = $env:VAULT_KEEPALIVE_SECRET,
  [switch]$Sync = $true
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Read-DotEnvValue([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  $line = Get-Content $path | Where-Object { $_ -match "^$([regex]::Escape($key))=(.*)$" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^$([regex]::Escape($key))=", "").Trim().Trim('"').Trim("'")
}

if (-not $Url) {
  $Url = "http://127.0.0.1:3000/api/vault/keepalive"
}
if ($Sync -and $Url -notmatch '[?&]sync=') {
  $Url += ($(if ($Url.Contains("?")) { "&" } else { "?" }) + "sync=1")
}

if (-not $Secret) { $Secret = $env:APP_SECRET }
if (-not $Secret) {
  $envFile = Join-Path $root ".env"
  $Secret = Read-DotEnvValue $envFile "VAULT_KEEPALIVE_SECRET"
  if (-not $Secret) { $Secret = Read-DotEnvValue $envFile "APP_SECRET" }
}
if (-not $Secret) {
  Write-Error "Set VAULT_KEEPALIVE_SECRET (or APP_SECRET) for the Authorization bearer token."
  exit 1
}

$headers = @{
  Authorization = "Bearer $Secret"
  Accept        = "application/json"
}

try {
  $res = Invoke-RestMethod -Method GET -Uri $Url -Headers $headers -TimeoutSec 120
  Write-Output ("ok={0} warmed={1} synced={2} status={3} durationMs={4} {5}" -f `
    $res.ok, $res.warmed, $res.synced, $res.status, $res.durationMs, $res.message)
  exit 0
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}

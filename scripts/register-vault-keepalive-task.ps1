# Register a Windows Scheduled Task that pings vault keepalive every 5 minutes.
# Run from the repo:
#   powershell -ExecutionPolicy Bypass -File .\scripts\register-vault-keepalive-task.ps1

param(
  [string]$TaskName = "BW-Konica-VaultKeepalive",
  [string]$Url = "http://127.0.0.1:3000/api/vault/keepalive?sync=1",
  [int]$Minutes = 5
)

$script = Join-Path $PSScriptRoot "vault-keepalive.ps1"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $script)) {
  Write-Error "Missing $script"
  exit 1
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -Url `"$Url`"" `
  -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes $Minutes) `
  -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Keep BW-Konica Bitwarden CLI vault session unlocked" `
  -Force | Out-Null

Write-Host "Registered task '$TaskName' every $Minutes minute(s)."
Write-Host "Target: $Url"
Write-Host "Secret is read at runtime from env or $root\.env"

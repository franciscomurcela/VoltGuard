# Sends a keepalive to every registered sensor, marking it "online" in OAM.
# Run once after seed-sensors.ps1 to bring all freshly-registered devices live.
#
#   .\scripts\bring-sensors-online.ps1
#   .\scripts\bring-sensors-online.ps1 -OamBaseUrl https://oam.voltguard.pt -BearerToken <jwt>

param(
  [string]$OamBaseUrl  = "http://localhost:8084",
  [string]$BearerToken = ""
)

$ErrorActionPreference = "Stop"

$Headers = @{ "Content-Type" = "application/json" }
if ($BearerToken) { $Headers["Authorization"] = "Bearer $BearerToken" }

try {
  $resp = Invoke-RestMethod -Method Get -Uri "$OamBaseUrl/sensors" -Headers $Headers
} catch {
  Write-Error "Could not list sensors: $($_.Exception.Message)"
  exit 1
}

if     ($resp -is [array]) { $items = $resp }
elseif ($resp.items)       { $items = $resp.items }
elseif ($resp.data)        { $items = $resp.data }
else                       { $items = @() }

if ($items.Count -eq 0) {
  Write-Host "No sensors found — seed some first with .\scripts\seed-sensors.ps1"
  exit 0
}

Write-Host "Bringing $($items.Count) sensor(s) online ..." -ForegroundColor Cyan

$Ok = 0
$Fail = 0

foreach ($s in $items) {
  try {
    Invoke-RestMethod -Method Post `
      -Uri "$OamBaseUrl/sensors/$($s.id)/keepalive" `
      -Headers $Headers -Body '{}' | Out-Null
    Write-Host "  ✓ $($s.name) ($($s.id))" -ForegroundColor Green
    $Ok++
  } catch {
    Write-Host "  ✗ $($s.name) ($($s.id)) — $($_.Exception.Message)" -ForegroundColor Red
    $Fail++
  }
}

Write-Host ""
Write-Host "Done — online: $Ok, failed: $Fail"
if ($Fail -gt 0) { exit 1 }

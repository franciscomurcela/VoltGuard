param(
  [string]$ApiBaseUrl = "http://localhost:8083",
  [string]$AuthToken = "your_secure_auth_token",
  [int]$BatchSize = 50,
  [bool]$DryRun = $true
)

if ($BatchSize -lt 1 -or $BatchSize -gt 500) {
  throw "BatchSize must be between 1 and 500."
}

$uri = "$ApiBaseUrl/v1/digest/process?auth_token=$AuthToken"
$payload = @{
  batch_size = $BatchSize
  dry_run = $DryRun
}

$body = $payload | ConvertTo-Json -Depth 3

Write-Host "POST $uri" -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $body

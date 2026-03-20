param(
  [Parameter(Mandatory = $true)]
  [string]$UserId,

  [string]$ApiBaseUrl = "http://localhost:8080",
  [string]$SourceId = "sensor_teste_01",
  [string]$MetricName = "voltage",
  [double]$Value = 821.4,
  [ValidateSet("LOW", "MEDIUM", "HIGH", "CRITICAL")]
  [string]$Severity = "HIGH",
  [ValidateSet("critical", "warnings")]
  [string]$AlertType = "critical",
  [string]$MessageTemplate = ""
)

$uri = "$ApiBaseUrl/api/anomalies/simulate-notification"
$payload = @{
  user_id = $UserId
  source_id = $SourceId
  metric_name = $MetricName
  value = $Value
  severity = $Severity
  alert_type = $AlertType
}

if ($MessageTemplate -and $MessageTemplate.Trim().Length -gt 0) {
  $payload.message_template = $MessageTemplate
}

$body = $payload | ConvertTo-Json -Depth 5

Write-Host "POST $uri" -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $body

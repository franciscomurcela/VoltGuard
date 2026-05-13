# Manually triggers /api/anomalies/simulate-notification on compositor-backend.
# Route is admin-only (requireRole('admin')). With AUTH_DISABLED=false (default)
# you must pass -BearerToken or set AUTH_DISABLED=true in .env for dev runs.
param(
  [string]$UserId = "op_joao_silva",

  [string]$ApiBaseUrl = "http://localhost:8080",
  [string]$SourceId = "sensor_teste_01",
  [string]$MetricName = "voltage",
  [double]$Value = 821.4,
  [ValidateSet("LOW", "MEDIUM", "HIGH", "CRITICAL")]
  [string]$Severity = "HIGH",
  [ValidateSet("critical", "warnings")]
  [string]$AlertType = "critical",
  [string]$MessageTemplate = "",
  [string]$BearerToken = ""
)

$uri = "$ApiBaseUrl/api/anomalies/simulate-notification"
$headers = @{ "Content-Type" = "application/json" }
if ($BearerToken -and $BearerToken.Trim().Length -gt 0) {
  $headers["Authorization"] = "Bearer $BearerToken"
}

if ($UserId -match '^\d+$') {
  Write-Warning "UserId '$UserId' parece inválido para este ambiente. Exemplos válidos: op_joao_silva, op_maria_costa"
}

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
try {
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body
} catch {
  $resp = $_.Exception.Response
  $statusCode = $null
  $statusDesc = $null
  $detail = $null

  if ($resp) {
    try { $statusCode = [int]$resp.StatusCode } catch {}
    try { $statusDesc = $resp.StatusDescription } catch {}

    # 1) Preferir mensagem já processada pelo PowerShell (quando disponível)
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $detail = $_.ErrorDetails.Message
    }

    # 2) Fallback: ler stream bruto do body
    if (-not $detail) {
      try {
        $stream = $resp.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $raw = $reader.ReadToEnd()
          if ($raw -and $raw.Trim().Length -gt 0) {
            $detail = $raw
          }
        }
      } catch {}
    }
  }

  if (-not $detail -or $detail.Trim().Length -eq 0) {
    $detail = $_.Exception.Message
  }

  $meta = @()
  if ($statusCode) { $meta += "HTTP $statusCode" }
  if ($statusDesc) { $meta += $statusDesc }
  $metaText = if ($meta.Count -gt 0) { " ($($meta -join ' - '))" } else { "" }

  Write-Error "Request falhou$metaText. Detalhe: $detail"
}

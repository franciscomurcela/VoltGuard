$ErrorActionPreference = "Stop"

$resolvedBaseUrl = if ($env:VG_BASE_URL) { $env:VG_BASE_URL } else { "http://127.0.0.1:8013" }
$resolvedToken = if ($env:VG_APP_TOKEN) { $env:VG_APP_TOKEN } else { "token_do_composer_123" }

$headers = @{ "X-App-Token" = $resolvedToken }
$sourceId = "sensor_e2e_opsd_" + (Get-Date -Format "yyyyMMddHHmmss")
$metricName = "consumption"
$webhookId = $null

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        throw "ASSERT FAILED: $Message"
    }
}

Write-Host "`n=== VoltGuard E2E Validation ===" -ForegroundColor Cyan
Write-Host "Base URL: $resolvedBaseUrl"
Write-Host "Source ID: $sourceId"

# 1) Health
Write-Host "`n[1/8] Health check..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/health" -Method GET
Assert-True ($health.status -eq "UP") "API health status should be 'UP'"
Write-Host "OK health" -ForegroundColor Green

# 2) Register webhook (delivery test depends on external target availability)
Write-Host "`n[2/8] Register webhook..." -ForegroundColor Yellow
$webhookBody = @{
    target_url = "https://webhook.site/00000000-0000-0000-0000-000000000000"
    event_type = "all"
} | ConvertTo-Json

$webhook = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/webhooks" -Method POST -Headers $headers -ContentType "application/json" -Body $webhookBody
$webhookId = $webhook.webhook_id
Assert-True (-not [string]::IsNullOrWhiteSpace($webhookId)) "Webhook ID should be returned"
Write-Host "OK webhook created: $webhookId" -ForegroundColor Green

# 3) Ingest real curated dataset
Write-Host "`n[3/8] Import real dataset (OPSD Germany Daily)..." -ForegroundColor Yellow
$uploadBody = @{
    source_url = "https://raw.githubusercontent.com/jenfly/opsd/master/opsd_germany_daily.csv"
    source_id = $sourceId
    metric_name = $metricName
    timestamp_column = "Date"
    value_column = "Consumption"
    config = @{
        temporal_mode = "daily"
        aggregation = "mean"
        timezone = "UTC"
        context = @{ scenario = "e2e_validation_real_dataset"; dataset = "opsd_germany_daily" }
    }
} | ConvertTo-Json -Depth 10

$upload = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/measurements/import" -Method POST -Headers $headers -ContentType "application/json" -Body $uploadBody
$measurementId = $upload.measurement_id
Assert-True (-not [string]::IsNullOrWhiteSpace($measurementId)) "Measurement ID should be returned"
Assert-True ($upload.rows_received -ge 6) "rows_received should be >= 6"
$expectedTrain = [int]($upload.rows_received * 0.8)
$expectedForecast = $upload.rows_received - $expectedTrain
Assert-True ($upload.rows_training -eq $expectedTrain) "rows_training should match 80% split"
Assert-True ($upload.rows_forecast -eq $expectedForecast) "rows_forecast should match 20% split"
Write-Host "OK uploaded: $measurementId" -ForegroundColor Green

# 4) Measurement detail
Write-Host "`n[4/8] Read measurement detail..." -ForegroundColor Yellow
$measurement = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/measurements/$measurementId" -Method GET -Headers $headers
Assert-True ($measurement.measurement_id -eq $measurementId) "Measurement detail ID mismatch"
Assert-True ($measurement.source_id -eq $sourceId) "Measurement source_id mismatch"
Assert-True ($measurement.training_status -eq "analyzed") "Measurement should be analyzed"
Write-Host "OK measurement analyzed" -ForegroundColor Green

# 5) Query anomalies by measurement
Write-Host "`n[5/8] Query anomalies..." -ForegroundColor Yellow
$anomalies = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/anomalies?measurement_id=$measurementId&limit=50&offset=0" -Method GET -Headers $headers
if ($anomalies.total -gt 0) {
    $firstAnomaly = $anomalies.items[0]
    $anomalyDetail = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/anomalies/$($firstAnomaly.anomaly_id)" -Method GET -Headers $headers
    Assert-True ($anomalyDetail.measurement_id -eq $measurementId) "Anomaly should be linked to measurement_id"
}
Write-Host "OK anomalies found: $($anomalies.total)" -ForegroundColor Green

# 6) Forecast
Write-Host "`n[6/8] Generate forecast..." -ForegroundColor Yellow
$forecast = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/forecasts/$sourceId`?metric_name=$metricName&periods=6" -Method GET -Headers $headers
Assert-True ($forecast.sensor_id -eq $sourceId) "Forecast sensor_id mismatch"
Assert-True ($forecast.metric_name -eq $metricName) "Forecast metric_name mismatch"
Assert-True ($forecast.forecasts.Count -eq 6) "Forecast should return 6 points"
Write-Host "OK forecast generated" -ForegroundColor Green

# 7) Metrics sanity
Write-Host "`n[7/8] Check metrics..." -ForegroundColor Yellow
$metrics = Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/metrics" -Method GET -Headers $headers
Assert-True ($metrics.total_measurements -ge 1) "Metrics total_measurements should be >= 1"
Assert-True ($metrics.total_anomalies -ge 1) "Metrics total_anomalies should be >= 1"
Write-Host "OK metrics" -ForegroundColor Green

# 8) Cleanup webhook
Write-Host "`n[8/8] Cleanup webhook..." -ForegroundColor Yellow
if ($webhookId) {
    Invoke-RestMethod -Uri "$resolvedBaseUrl/v1/webhooks/$webhookId" -Method DELETE -Headers $headers | Out-Null
    Write-Host "OK webhook deleted: $webhookId" -ForegroundColor Green
}

Write-Host "`n=== SUCCESS: pipeline end-to-end validated ===" -ForegroundColor Cyan
Write-Host "Measurement ID: $measurementId"
Write-Host "Source ID: $sourceId"
Write-Host "Anomalies detected: $($anomalies.total)"
Write-Host "Note: webhook delivery itself requires a real endpoint (e.g., your webhook.site URL)." -ForegroundColor DarkYellow

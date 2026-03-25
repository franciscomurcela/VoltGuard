$ErrorActionPreference = "Stop"

$baseUrl = if ($env:VG_BASE_URL) { $env:VG_BASE_URL } else { "http://127.0.0.1:8013" }
$appToken = if ($env:VG_APP_TOKEN) { $env:VG_APP_TOKEN } else { "token_do_composer_123" }
$adminToken = if ($env:VG_ADMIN_TOKEN) { $env:VG_ADMIN_TOKEN } else { "token_admin_999" }
$headers = @{ "X-App-Token" = $appToken }
$adminHeaders = @{ "X-App-Token" = $adminToken }

$runId = (Get-Date -Format "yyyyMMddHHmmss")
$sourceIdPrimary = "sensor_audit_a10_$runId"
$sourceIdSecondary = "sensor_audit_opsd_$runId"
$sourceId = $sourceIdPrimary
$metricName = "value"

$results = New-Object System.Collections.Generic.List[object]
$createdWebhookIds = New-Object System.Collections.Generic.List[string]
$createdMeasurementIds = New-Object System.Collections.Generic.List[string]
$createdTokenIds = New-Object System.Collections.Generic.List[string]

$measurementIdPrimary = $null
$measurementIdSecondary = $null
$firstAnomalyId = $null
$modelId = "model_prophet_v1"

function Add-Result {
    param(
        [string]$Method,
        [string]$Path,
        [bool]$Passed,
        [int]$StatusCode,
        [int]$LatencyMs,
        [string]$Message,
        [object]$ResponseBody = $null
    )

    $results.Add([PSCustomObject]@{
        method = $Method
        path = $Path
        passed = $Passed
        status_code = $StatusCode
        latency_ms = $LatencyMs
        message = $Message
        response = $ResponseBody
    }) | Out-Null
}

function Invoke-ApiJson {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$RequestHeaders,
        [object]$BodyObject = $null
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $uri = "$baseUrl$Path"
        if ($null -ne $BodyObject) {
            $bodyJson = $BodyObject | ConvertTo-Json -Depth 12
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $RequestHeaders -ContentType "application/json" -Body $bodyJson
        }
        else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $RequestHeaders
        }
        $sw.Stop()
        return [PSCustomObject]@{ ok = $true; status = 200; latency = [int]$sw.ElapsedMilliseconds; body = $response; error = $null }
    }
    catch {
        $sw.Stop()
        $statusCode = -1
        $errorBody = $_.Exception.Message
        if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream()) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
                $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errorBody = $sr.ReadToEnd()
            }
            catch {}
        }
        return [PSCustomObject]@{ ok = $false; status = $statusCode; latency = [int]$sw.ElapsedMilliseconds; body = $null; error = $errorBody }
    }
}

function Invoke-ApiMultipartCsv {
    param(
        [string]$Path,
        [hashtable]$RequestHeaders,
        [string]$CsvFilePath,
        [string]$SourceId,
        [string]$MetricName
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $client = $null
    try {
        Add-Type -AssemblyName System.Net.Http
        $client = [System.Net.Http.HttpClient]::new()
        foreach ($key in $RequestHeaders.Keys) {
            $client.DefaultRequestHeaders.Add($key, [string]$RequestHeaders[$key])
        }

        $content = [System.Net.Http.MultipartFormDataContent]::new()

        $fileBytes = [System.IO.File]::ReadAllBytes($CsvFilePath)
        $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("text/csv")
        $content.Add($fileContent, "file", [System.IO.Path]::GetFileName($CsvFilePath))

        $content.Add([System.Net.Http.StringContent]::new($SourceId), "source_id")
        $content.Add([System.Net.Http.StringContent]::new($MetricName), "metric_name")
        $content.Add([System.Net.Http.StringContent]::new("0.8"), "train_ratio")
        $content.Add([System.Net.Http.StringContent]::new("hourly"), "temporal_mode")
        $content.Add([System.Net.Http.StringContent]::new("none"), "aggregation")
        $content.Add([System.Net.Http.StringContent]::new("UTC"), "timezone")

        $httpResponse = $client.PostAsync("$baseUrl$Path", $content).GetAwaiter().GetResult()
        $responseText = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()

        $sw.Stop()

        if (-not $httpResponse.IsSuccessStatusCode) {
            return [PSCustomObject]@{ ok = $false; status = [int]$httpResponse.StatusCode; latency = [int]$sw.ElapsedMilliseconds; body = $null; error = $responseText }
        }

        $parsed = $null
        try { $parsed = $responseText | ConvertFrom-Json } catch { $parsed = $responseText }
        return [PSCustomObject]@{ ok = $true; status = [int]$httpResponse.StatusCode; latency = [int]$sw.ElapsedMilliseconds; body = $parsed; error = $null }
    }
    catch {
        $sw.Stop()
        return [PSCustomObject]@{ ok = $false; status = -1; latency = [int]$sw.ElapsedMilliseconds; body = $null; error = $_.Exception.Message }
    }
    finally {
        if ($null -ne $client) { $client.Dispose() }
    }
}

function Assert-Ok {
    param(
        [object]$Result,
        [string]$Method,
        [string]$Path,
        [string]$SuccessMessage,
        [scriptblock]$ExtraCheck = $null
    )

    if (-not $Result.ok) {
        Add-Result -Method $Method -Path $Path -Passed $false -StatusCode $Result.status -LatencyMs $Result.latency -Message $Result.error
        return $false
    }

    if ($null -ne $ExtraCheck) {
        try {
            & $ExtraCheck $Result.body | Out-Null
        }
        catch {
            Add-Result -Method $Method -Path $Path -Passed $false -StatusCode $Result.status -LatencyMs $Result.latency -Message $_.Exception.Message -ResponseBody $Result.body
            return $false
        }
    }

    Add-Result -Method $Method -Path $Path -Passed $true -StatusCode $Result.status -LatencyMs $Result.latency -Message $SuccessMessage -ResponseBody $Result.body
    return $true
}

Write-Host "`n=== VoltGuard API Audit ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl"
Write-Host "Primary source ID: $sourceIdPrimary"
Write-Host "Secondary source ID: $sourceIdSecondary"

# 1) Health (no token)
$r = Invoke-ApiJson -Method "GET" -Path "/v1/health" -RequestHeaders @{}
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/health" -SuccessMessage "health ok" -ExtraCheck {
    param($body)
    if ($body.status -ne "UP") { throw "health status inesperado: $($body.status)" }
})

# 2) Metrics
$r = Invoke-ApiJson -Method "GET" -Path "/v1/metrics" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/metrics" -SuccessMessage "metrics ok")

# 3) Models list
$r = Invoke-ApiJson -Method "GET" -Path "/v1/models" -RequestHeaders $headers
if (Assert-Ok -Result $r -Method "GET" -Path "/v1/models" -SuccessMessage "models ok" -ExtraCheck {
    param($body)
    if (-not $body -or $body.Count -lt 1) { throw "nenhum modelo disponível" }
}) {
    $modelId = $r.body[0].model_id
}

# 4) Model config get
$r = Invoke-ApiJson -Method "GET" -Path "/v1/models/$modelId/config" -RequestHeaders $headers
$originalConfig = $null
if (Assert-Ok -Result $r -Method "GET" -Path "/v1/models/$modelId/config" -SuccessMessage "model config get ok") {
    $originalConfig = $r.body
}

# 5) Model config update (and later restore)
if ($null -ne $originalConfig) {
    $newInterval = [Math]::Max(0.5, [Math]::Min(0.99, [double]$originalConfig.prophet_uncertainty_interval - 0.01))
    if ($newInterval -eq [double]$originalConfig.prophet_uncertainty_interval) { $newInterval = [Math]::Min(0.99, $newInterval + 0.01) }

    $updateBody = @{
        model_id = $modelId
        prophet_uncertainty_interval = $newInterval
        pyod_contamination_rate = [double]$originalConfig.pyod_contamination_rate
    }

    $r = Invoke-ApiJson -Method "PUT" -Path "/v1/models/$modelId/config" -RequestHeaders $headers -BodyObject $updateBody
    [void](Assert-Ok -Result $r -Method "PUT" -Path "/v1/models/$modelId/config" -SuccessMessage "model config update ok")
}

# 6) Webhooks list/create/get
$r = Invoke-ApiJson -Method "GET" -Path "/v1/webhooks" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/webhooks" -SuccessMessage "webhooks list ok")

$webhookBody = @{ target_url = "https://webhook.site/00000000-0000-0000-0000-000000000000"; event_type = "all" }
$r = Invoke-ApiJson -Method "POST" -Path "/v1/webhooks" -RequestHeaders $headers -BodyObject $webhookBody
if (Assert-Ok -Result $r -Method "POST" -Path "/v1/webhooks" -SuccessMessage "webhook create ok") {
    $createdWebhookIds.Add($r.body.webhook_id) | Out-Null
    $createdWebhookId = $r.body.webhook_id

    $rGetWebhook = Invoke-ApiJson -Method "GET" -Path "/v1/webhooks/$createdWebhookId" -RequestHeaders $headers
    [void](Assert-Ok -Result $rGetWebhook -Method "GET" -Path "/v1/webhooks/$createdWebhookId" -SuccessMessage "webhook detail ok")
}

# 7) Auth create/revoke token
$tokenBody = @{ service_name = "audit-script-service" }
$r = Invoke-ApiJson -Method "POST" -Path "/v1/auth/tokens" -RequestHeaders $adminHeaders -BodyObject $tokenBody
if (Assert-Ok -Result $r -Method "POST" -Path "/v1/auth/tokens" -SuccessMessage "token create ok") {
    $createdTokenIds.Add($r.body.token_id) | Out-Null
    $createdTokenId = $r.body.token_id
    $rDelToken = Invoke-ApiJson -Method "DELETE" -Path "/v1/auth/tokens/$createdTokenId" -RequestHeaders $adminHeaders
    [void](Assert-Ok -Result $rDelToken -Method "DELETE" -Path "/v1/auth/tokens/$createdTokenId" -SuccessMessage "token revoke ok")
}

# 8) Measurements import URL (real dataset #1 - a10)
$importHouseholdBody = @{
    source_url = "https://raw.githubusercontent.com/selva86/datasets/master/a10.csv"
    source_id = $sourceIdPrimary
    metric_name = "value"
    timestamp_column = "date"
    value_column = "value"
    config = @{ temporal_mode = "monthly"; aggregation = "mean"; timezone = "UTC" }
}

$r = Invoke-ApiJson -Method "POST" -Path "/v1/measurements/import" -RequestHeaders $headers -BodyObject $importHouseholdBody
if (Assert-Ok -Result $r -Method "POST" -Path "/v1/measurements/import (a10)" -SuccessMessage "measurements import a10 ok") {
    $measurementIdPrimary = $r.body.measurement_id
    $sourceId = $r.body.source_id
    $metricName = $r.body.metric_name
    $createdMeasurementIds.Add($measurementIdPrimary) | Out-Null
}

# 9) Measurements import URL (real dataset #2 - OPSD Germany Daily)
$importPjmeBody = @{
    source_url = "https://raw.githubusercontent.com/jenfly/opsd/master/opsd_germany_daily.csv"
    source_id = $sourceIdSecondary
    metric_name = "consumption"
    timestamp_column = "Date"
    value_column = "Consumption"
    config = @{ temporal_mode = "daily"; aggregation = "mean"; timezone = "UTC" }
}

$r = Invoke-ApiJson -Method "POST" -Path "/v1/measurements/import" -RequestHeaders $headers -BodyObject $importPjmeBody
if (Assert-Ok -Result $r -Method "POST" -Path "/v1/measurements/import (opsd)" -SuccessMessage "measurements import opsd ok") {
    $measurementIdSecondary = $r.body.measurement_id
    $createdMeasurementIds.Add($measurementIdSecondary) | Out-Null
}

# 11) Measurements list + filter + detail
$r = Invoke-ApiJson -Method "GET" -Path "/v1/measurements" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/measurements" -SuccessMessage "measurements list ok")

$r = Invoke-ApiJson -Method "GET" -Path "/v1/measurements?source_id=$sourceId" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/measurements?source_id=$sourceId" -SuccessMessage "measurements filter by source ok")

if ($measurementIdPrimary) {
    $r = Invoke-ApiJson -Method "GET" -Path "/v1/measurements/$measurementIdPrimary" -RequestHeaders $headers
    [void](Assert-Ok -Result $r -Method "GET" -Path "/v1/measurements/$measurementIdPrimary" -SuccessMessage "measurement detail ok")
}

# 12) Anomalies list + detail
if ($measurementIdPrimary) {
    $r = Invoke-ApiJson -Method "GET" -Path "/v1/anomalies?measurement_id=$measurementIdPrimary&limit=50&offset=0" -RequestHeaders $headers
    if (Assert-Ok -Result $r -Method "GET" -Path "/v1/anomalies?measurement_id=$measurementIdPrimary" -SuccessMessage "anomalies by measurement ok") {
        if ($r.body.items.Count -gt 0) {
            $firstAnomalyId = $r.body.items[0].anomaly_id
        }
    }
}

$r = Invoke-ApiJson -Method "GET" -Path "/v1/anomalies?source_id=$sourceId&limit=50&offset=0" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/anomalies?source_id=$sourceId" -SuccessMessage "anomalies by source ok")

if ($firstAnomalyId) {
    $r = Invoke-ApiJson -Method "GET" -Path "/v1/anomalies/$firstAnomalyId" -RequestHeaders $headers
    [void](Assert-Ok -Result $r -Method "GET" -Path "/v1/anomalies/$firstAnomalyId" -SuccessMessage "anomaly detail ok")
}

# 13) Forecast
$r = Invoke-ApiJson -Method "GET" -Path "/v1/forecasts/${sourceId}?metric_name=${metricName}&periods=6" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/forecasts/$sourceId" -SuccessMessage "forecast ok")

# 14) Metrics again
$r = Invoke-ApiJson -Method "GET" -Path "/v1/metrics" -RequestHeaders $headers
[void](Assert-Ok -Result $r -Method "GET" -Path "/v1/metrics (final)" -SuccessMessage "final metrics ok")

# Cleanup webhooks
foreach ($webhookId in $createdWebhookIds) {
    $r = Invoke-ApiJson -Method "DELETE" -Path "/v1/webhooks/$webhookId" -RequestHeaders $headers
    [void](Assert-Ok -Result $r -Method "DELETE" -Path "/v1/webhooks/$webhookId" -SuccessMessage "webhook cleanup ok")
}

# Restore original model config
if ($null -ne $originalConfig) {
    $restoreBody = @{
        model_id = $modelId
        prophet_uncertainty_interval = [double]$originalConfig.prophet_uncertainty_interval
        pyod_contamination_rate = [double]$originalConfig.pyod_contamination_rate
    }
    $r = Invoke-ApiJson -Method "PUT" -Path "/v1/models/$modelId/config" -RequestHeaders $headers -BodyObject $restoreBody
    [void](Assert-Ok -Result $r -Method "PUT" -Path "/v1/models/$modelId/config (restore)" -SuccessMessage "model config restore ok")
}

# Summary
$passCount = @($results | Where-Object { $_.passed }).Count
$failCount = @($results | Where-Object { -not $_.passed }).Count
$totalCount = $results.Count

Write-Host "`n=== Audit Summary ===" -ForegroundColor Cyan
Write-Host "Total checks: $totalCount"
Write-Host "Passed: $passCount" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "Failed: $failCount" -ForegroundColor Red
}
else {
    Write-Host "Failed: $failCount" -ForegroundColor Green
}

$results | Select-Object method, path, passed, status_code, latency_ms, message | Format-Table -AutoSize

if ($firstAnomalyId) {
    Write-Host "`nFirst anomaly detail endpoint tested: /v1/anomalies/$firstAnomalyId" -ForegroundColor Yellow
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportsDir = Join-Path (Get-Location) "reports"
if (-not (Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
}
$reportPath = Join-Path $reportsDir "api_audit_report_$timestamp.json"
$results | ConvertTo-Json -Depth 15 | Out-File -FilePath $reportPath -Encoding utf8
Write-Host "`nReport saved to: $reportPath" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
}

exit 0

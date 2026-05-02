param(
  [string]$Target = "",
  [string]$UserId = "",

  [string]$NotificationsBaseUrl = "http://localhost:8083",
  [string]$AuthToken = "your_secure_auth_token",
  [string]$ClientId = "energy_composer",
  [ValidateSet("twilio_sms", "twilio_whatsapp", "email")]
  [string]$Channel = "email",
  [ValidateSet("critical", "warnings")]
  [string]$AlertType = "critical",
  [string]$MessageTemplate = "Teste real-time VoltGuard",
  [switch]$AlsoSendSecond,
  [bool]$EnsureFirstForTarget = $true,
  [string]$MongoContainerName = "voltguard-notifications-db",
  [string]$MongoDatabase = "notifications_db",
  [string]$MongoUsername = "admin",
  [string]$MongoPassword = ""
)

$escapedAuthToken = [uri]::EscapeDataString($AuthToken)
$uri = "$NotificationsBaseUrl/v1/notifications?auth_token=$escapedAuthToken"

function Resolve-TargetByUserId([string]$resolvedUserId, [string]$resolvedChannel) {
  $encodedUserId = [uri]::EscapeDataString($resolvedUserId)
  $preferencesUri = "$NotificationsBaseUrl/v1/preferences/by-user/$encodedUserId"

  try {
    $preferences = Invoke-RestMethod -Method Get -Uri $preferencesUri
  } catch {
    throw "Nao foi possivel obter preferencias para user_id '$resolvedUserId' em $preferencesUri"
  }

  if ($resolvedChannel -eq 'email') {
    if ($preferences.target_email) {
      return [string]$preferences.target_email
    }
    throw "user_id '$resolvedUserId' nao tem target_email configurado"
  }

  if ($preferences.target_phone) {
    return [string]$preferences.target_phone
  }
  throw "user_id '$resolvedUserId' nao tem target_phone configurado"
}

function Reset-NotificationHistoryForTarget([string]$resolvedTarget) {
  if (-not $MongoPassword) {
    if ($env:NOTIFICATIONS_DB_PASSWORD) {
      $script:MongoPassword = $env:NOTIFICATIONS_DB_PASSWORD
    } else {
      $script:MongoPassword = "notifications_password"
    }
  }

  $escapedTarget = $resolvedTarget.Replace("'", "\\'")
  $query = "db.notifications.deleteMany({ target: '$escapedTarget' })"

  Write-Host "[setup] A limpar historico de notificacoes para target '$resolvedTarget' (ambiente de teste)" -ForegroundColor DarkYellow
  try {
    $result = docker exec $MongoContainerName mongosh --quiet -u $MongoUsername -p $MongoPassword --authenticationDatabase admin $MongoDatabase --eval $query
    Write-Host "[setup] Resultado cleanup: $result" -ForegroundColor DarkYellow
  } catch {
    throw "Falha ao limpar historico no Mongo. Confirma Docker/container '$MongoContainerName' e credenciais da BD. Erro: $($_.Exception.Message)"
  }
}

if (-not $UserId -and $Target -match '^op_[a-zA-Z0-9_]+$') {
  Write-Warning "Foi recebido um user_id no parametro -Target. Vou resolver o target automaticamente pelas preferencias."
  $UserId = $Target
  $Target = ""
}

if (-not $Target) {
  if (-not $UserId) {
    throw "Indica -Target (telefone/email) ou -UserId (ex.: op_joao_silva)."
  }
  $Target = Resolve-TargetByUserId -resolvedUserId $UserId -resolvedChannel $Channel
  Write-Host "Target resolvido por user_id '$UserId': $Target" -ForegroundColor DarkCyan
}

if ($Channel -eq 'twilio_sms') {
  Write-Warning "Twilio trial pode falhar em primeira mensagem com link (erro 30044: Trial Message Length Exceeded)."
  Write-Warning "Para validar a funcionalidade de link sem esta limitacao, usa -Channel email."
}

if ($EnsureFirstForTarget) {
  Reset-NotificationHistoryForTarget -resolvedTarget $Target
}

function Send-Notification([string]$messageTemplateValue) {
  $payload = @{
    client_id = $ClientId
    target = $Target
    channel = $Channel
    alert_type = $AlertType
    message_template = $messageTemplateValue
  }

  $body = $payload | ConvertTo-Json -Depth 5
  return Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $body
}

Write-Host "[1/2] A enviar primeira notificacao para $Target" -ForegroundColor Cyan
$first = Send-Notification -messageTemplateValue "$MessageTemplate [primeira]"
$first | ConvertTo-Json -Depth 10

if ($AlsoSendSecond) {
  Write-Host "[2/2] A enviar segunda notificacao para $Target" -ForegroundColor Cyan
  $second = Send-Notification -messageTemplateValue "$MessageTemplate [segunda]"
  $second | ConvertTo-Json -Depth 10
}

Write-Host "" 
Write-Host "Validacao esperada no end user:" -ForegroundColor Yellow
Write-Host "- Primeira mensagem inclui o link de preferencias com secret." -ForegroundColor Yellow
if ($AlsoSendSecond) {
  Write-Host "- Segunda mensagem nao inclui o link (ja nao e primeira mensagem)." -ForegroundColor Yellow
}

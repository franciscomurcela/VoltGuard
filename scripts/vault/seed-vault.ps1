# AD-HOC USE ONLY. The vault-seeder service in docker-compose.yaml seeds Vault
# automatically every time the stack starts. Run this script only to re-push
# secrets between boots (e.g. you edited .env and don't want to recreate the
# stack). Reads every KEY=VALUE pair from .env into secret/compositor.
$ErrorActionPreference = "Stop"

$VaultAddr = "http://127.0.0.1:8200"
$VaultToken = "dev-root"
$EnvFile = ".env"

if (-not (Test-Path $EnvFile)) {
    Write-Error "Ficheiro .env não encontrado! Garante que estás na pasta raiz do projeto."
}

Write-Host "--- Lendo segredos de $EnvFile ---" -ForegroundColor Cyan

# 1. Extrair chaves e valores do .env (ignora comentários # e linhas vazias)
$VaultArgs = @("kv", "put", "secret/compositor")
$Count = 0

Get-Content $EnvFile | ForEach-Object {
    $Line = $_.Trim()
    if ($Line -and -not $Line.StartsWith("#") -and $Line.Contains("=")) {
        # Divide apenas no primeiro '=' para evitar problemas com strings que contenham '='
        $Key, $Value = $Line.Split('=', 2)
        $Key = $Key.Trim()
        $Value = $Value.Trim()
        
        # Opcional: Remove aspas se existirem no .env (ex: "valor" -> valor)
        $Value = $Value -replace '^"|"$',''
        
        $VaultArgs += "$Key=$Value"
        $Count++
    }
}

Write-Host "Encontradas $Count variáveis. Injetando no Vault..." -ForegroundColor Yellow

# 2. Enviar tudo de uma vez para o Vault
docker compose exec -T vault env VAULT_ADDR="$VaultAddr" VAULT_TOKEN="$VaultToken" vault @VaultArgs

Write-Host "--- Sucesso! O Vault agora tem os valores reais do teu .env ---" -ForegroundColor Green
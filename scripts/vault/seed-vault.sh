#!/usr/bin/env bash
# AD-HOC USE ONLY. The `vault-seeder` service in docker-compose.yaml seeds
# Vault automatically every time the stack starts. Run this script only to
# re-push secrets between boots (e.g. you edited .env and don't want to
# `docker compose down/up`). Reads every KEY=VALUE pair from .env into
# secret/compositor — including non-secret keys, which is fine for dev.
set -euo pipefail

# Configurações de Conexão
VAULT_ADDR="http://127.0.0.1:8200"
VAULT_TOKEN="dev-root"
ENV_FILE=".env"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Erro: Ficheiro $ENV_FILE não encontrado!"
    exit 1
fi

echo -e "\e[36m--- Lendo segredos de $ENV_FILE ---\e[0m"

# Array para acumular os argumentos do Vault
vault_args=("kv" "put" "secret/compositor")
count=0

# Ler o ficheiro .env linha a linha
while IFS= read -r line || [[ -n "$line" ]]; do
    # Remove espaços em branco no início e fim
    line=$(echo "$line" | xargs)

    # Ignora linhas vazias ou comentários
    if [[ -z "$line" || "$line" == #* ]]; then
        continue
    fi

    # Garante que a linha contém um '='
    if [[ "$line" == *"="* ]]; then
        # Divide na primeira ocorrência de '='
        key="${line%%=*}"
        value="${line#*=}"

        # Remove aspas simples ou duplas do início e fim do valor
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"

        # Adiciona ao array de argumentos
        vault_args+=("$key=$value")
        ((count++))
    fi
done < "$ENV_FILE"

echo -e "\e[33mEncontradas $count variáveis. Injetando no Vault...\e[0m"

# Executa o comando no contentor do Vault
docker compose exec -T vault env VAULT_ADDR="$VAULT_ADDR" VAULT_TOKEN="$VAULT_TOKEN" vault "${vault_args[@]}"

echo -e "\e[32m--- Sucesso! O Vault Bash Seed foi concluído ---\e[0m"
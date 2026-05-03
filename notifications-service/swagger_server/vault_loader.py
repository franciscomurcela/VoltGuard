import os
import requests
import logging

# Configura o logger para aparecer nos logs do Docker
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VaultLoader")

def load_vault_secrets():
    vault_addr = os.getenv("VAULT_ADDR", "http://vault:8200")
    vault_token = os.getenv("VAULT_TOKEN", "dev-root")
    # Path para KV V2
    vault_path = os.getenv("VAULT_SECRET_PATH", "secret/data/compositor")

    logger.info(f"Connecting to Vault at {vault_addr}...")

    try:
        url = f"{vault_addr}/v1/{vault_path}"
        headers = {"X-Vault-Token": vault_token}
        
        response = requests.get(url, headers=headers, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            # No motor KV V2, os segredos estão em data['data']
            secrets = data.get("data", {}).get("data", {})
            
            count = 0
            for key, value in secrets.items():
                # Injeta no ambiente se não existir (ou estiver vazio)
                if not os.getenv(key):
                    os.environ[key] = str(value)
                    count += 1
            
            logger.info(f"Successfully loaded {count} secrets from Vault.")
        else:
            logger.error(f"Failed to load secrets. Status: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error connecting to Vault: {e}")

# Executa se o ficheiro for chamado diretamente
if __name__ == "__main__":
    load_vault_secrets()
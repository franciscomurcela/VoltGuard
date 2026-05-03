use std::env;
use std::collections::HashMap;

pub fn load_vault_secrets() {
    let vault_addr = env::var("VAULT_ADDR").unwrap_or_else(|_| "http://vault:8200".to_string());
    let vault_token = env::var("VAULT_TOKEN").unwrap_or_else(|_| "dev-root".to_string());
    let vault_path = env::var("VAULT_SECRET_PATH").unwrap_or_else(|_| "secret/data/compositor".to_string());

    println!("[Vault] Attempting to load secrets from {}...", vault_addr);

    let client = reqwest::blocking::Client::new();
    let url = format!("{}/v1/{}", vault_addr, vault_path);

    let res = client
        .get(url)
        .header("X-Vault-Token", vault_token)
        .send();

    match res {
        Ok(response) => {
            if response.status().is_success() {
                let json: serde_json::Value = response.json().unwrap_or_default();
                
                // No Vault KV V2, os dados estão em ["data"]["data"]
                if let Some(secrets) = json["data"]["data"].as_object() {
                    let mut count = 0;
                    for (key, value) in secrets {
                        // Só injeta se a variável não estiver já definida no sistema
                        if env::var(key).is_err() {
                            let val_str = value.as_str().unwrap_or("");
                            env::set_var(key, val_str);
                            count += 1;
                        }
                    }
                    println!("[Vault] Successfully loaded {} secrets.", count);
                }
            } else {
                println!("[Vault] Error: Failed to load secrets. Status: {}", response.status());
            }
        }
        Err(e) => println!("[Vault] Connection error: {}", e),
    }
}
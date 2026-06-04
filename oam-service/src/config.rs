use std::env;

pub struct Config {
    pub database_url: String,
    pub server_addr: String,
    pub firmware_storage_path: String,
    pub base_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            server_addr: env::var("SERVER_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:8080".to_string()),
            firmware_storage_path: env::var("FIRMWARE_STORAGE_PATH")
                .unwrap_or_else(|_| "./firmware_storage".to_string()),
            base_url: env::var("BASE_URL")
                .unwrap_or_else(|_| "http://localhost:8084".to_string()),
        }
    }
}

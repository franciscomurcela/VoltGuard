pub mod anomalies;
pub mod firmware;
pub mod sensors;

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub type DbPool = PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: DbPool,
    pub firmware_storage_path: String,
    pub base_url: String,
}

pub async fn create_pool(database_url: &str) -> DbPool {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .expect("Failed to connect to PostgreSQL")
}

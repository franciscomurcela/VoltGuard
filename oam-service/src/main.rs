use dotenvy::dotenv;
use tracing_subscriber::EnvFilter;

mod config;
mod db;
mod error;
mod handlers;
mod models;

#[tokio::main]
async fn main() {
    dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = config::Config::from_env();

    let pool = db::create_pool(&config.database_url).await;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Migration failed");

    std::fs::create_dir_all(&config.firmware_storage_path)
        .expect("Failed to create firmware storage dir");

    let state = db::AppState {
        pool,
        firmware_storage_path: config.firmware_storage_path,
        base_url: config.base_url,
    };

    let app = handlers::router(state);

    let listener = tokio::net::TcpListener::bind(&config.server_addr)
        .await
        .unwrap();

    tracing::info!("Listening on {}", config.server_addr);
    axum::serve(listener, app).await.unwrap();
}

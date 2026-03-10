pub mod actions;
pub mod anomaly;
pub mod firmware;
pub mod keepalive;
pub mod sensors;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

use crate::db::AppState;

async fn health() -> axum::http::StatusCode {
    axum::http::StatusCode::OK
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        // Inventory
        .route("/sensors", post(sensors::create).get(sensors::list))
        .route("/sensors/:id", get(sensors::get_one).delete(sensors::delete))
        // Firmware management
        .route("/firmwares", post(firmware::upload).get(firmware::list))
        .route("/firmwares/download/:id", get(firmware::download))
        // Actions
        .route("/sensors/:id/actions/update-firmware", post(actions::update_firmware))
        .route("/sensors/:id/actions/reboot", post(actions::reboot))
        .route("/sensors/:id/actions/clear-anomaly", post(actions::clear_anomaly))
        // Integrations & monitoring
        .route("/sensors/:id/anomalies", post(anomaly::report))
        .route("/sensors/:id/keepalive", post(keepalive::keepalive))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

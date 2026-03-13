pub mod actions;
pub mod anomaly;
pub mod firmware;
pub mod keepalive;
pub mod sensors;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::{db::AppState, openapi::ApiDoc};

async fn health() -> Json<Value> {
    Json(json!({ "status": "healthy" }))
}

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(health))
        // Inventory
        .route("/sensors/stats", get(sensors::stats))
        .route("/sensors", post(sensors::create).get(sensors::list))
        .route(
            "/sensors/:id",
            get(sensors::get_one).patch(sensors::update).delete(sensors::delete),
        )
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
        .layer(CorsLayer::permissive())
        .with_state(state);

    api.merge(
        SwaggerUi::new("/swagger-ui")
            .url("/api-docs/openapi.json", ApiDoc::openapi()),
    )
}

pub mod actions;
pub mod anomaly;
pub mod firmware;
pub mod keepalive;
pub mod sensors;

use axum::{
    extract::DefaultBodyLimit,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use axum::middleware::from_fn;
use crate::metrics;

use crate::{db::AppState, openapi::ApiDoc};

async fn health() -> Json<Value> {
    Json(json!({ "status": "healthy" }))
}

pub fn router(state: AppState) -> Router {
    // Init metrics registry
    metrics::init_metrics();

    // Middleware to increment request counter
    async fn request_metrics(req: axum::http::Request<axum::body::Body>, next: axum::middleware::Next) -> impl IntoResponse {
        let method = req.method().as_str().to_string();
        let path = req.uri().path().to_string();
        let response = next.run(req).await;
        let status = response.status().as_u16().to_string();
        metrics::inc_request(&method, &path, &status);
        response
    }

    let api = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics::metrics_handler))
        // Inventory
        .route("/sensors/stats", get(sensors::stats))
        .route("/sensors/import", post(sensors::import))
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
        .layer(from_fn(request_metrics))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    api.merge(
        SwaggerUi::new("/swagger-ui")
            .url("/api-docs/openapi.json", ApiDoc::openapi()),
    )
}

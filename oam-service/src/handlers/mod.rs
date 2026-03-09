pub mod firmware;
pub mod sensors;

use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

use crate::db::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/sensors", post(sensors::create).get(sensors::list))
        .route("/sensors/:id", get(sensors::get_one).delete(sensors::delete))
        .route("/firmwares", post(firmware::upload).get(firmware::list))
        .route("/firmwares/download/:id", get(firmware::download))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100 MB for firmware uploads
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

pub mod sensors;

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

use crate::db::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/sensors", post(sensors::create).get(sensors::list))
        .route("/sensors/:id", get(sensors::get_one).delete(sensors::delete))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

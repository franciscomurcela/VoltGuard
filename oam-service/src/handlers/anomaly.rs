use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::sensor::Sensor,
};

#[utoipa::path(
    post,
    path = "/sensors/{id}/anomalies",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    responses(
        (status = 200, description = "Anomaly flag set on sensor", body = Sensor),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Anomalies",
)]
pub async fn report(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::mark_anomaly(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

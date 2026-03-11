use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::anomaly::{AnomalyInput, AnomalyLog},
};

#[utoipa::path(
    post,
    path = "/sensors/{id}/anomalies",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    request_body = AnomalyInput,
    responses(
        (status = 200, description = "Anomaly logged", body = AnomalyLog),
        (status = 400, description = "Invalid input", body = ErrorBody),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Anomalies",
)]
pub async fn report(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<AnomalyInput>,
) -> Result<Json<AnomalyLog>, ApiError> {
    if input.description.trim().is_empty() {
        return Err(ApiError::BadRequest("description cannot be empty".to_string()));
    }

    // Verify sensor exists before writing the anomaly log
    db::sensors::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    let log = db::anomalies::report(&state.pool, id, &input.description).await?;
    Ok(Json(log))
}

use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::ApiError,
    models::anomaly::{AnomalyInput, AnomalyLog},
};

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

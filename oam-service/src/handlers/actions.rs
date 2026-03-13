use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::sensor::Sensor,
};

#[derive(Deserialize, ToSchema)]
pub struct ActionUpdateInput {
    pub firmware_id: Uuid,
}

#[utoipa::path(
    post,
    path = "/sensors/{id}/actions/update-firmware",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    request_body = ActionUpdateInput,
    responses(
        (status = 200, description = "Firmware update scheduled", body = Sensor),
        (status = 404, description = "Sensor or firmware not found", body = ErrorBody),
    ),
    tag = "Actions",
)]
pub async fn update_firmware(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<ActionUpdateInput>,
) -> Result<Json<Sensor>, ApiError> {
    // Verify the target firmware exists before scheduling the action
    db::firmware::find_by_id(&state.pool, input.firmware_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Firmware '{}' not found", input.firmware_id)))?;

    let sensor = db::sensors::schedule_firmware_update(&state.pool, id, input.firmware_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

#[utoipa::path(
    post,
    path = "/sensors/{id}/actions/reboot",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    responses(
        (status = 200, description = "Reboot scheduled", body = Sensor),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Actions",
)]
pub async fn reboot(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::schedule_reboot(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

#[utoipa::path(
    post,
    path = "/sensors/{id}/actions/clear-anomaly",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    responses(
        (status = 200, description = "Anomaly cleared", body = Sensor),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Actions",
)]
pub async fn clear_anomaly(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::clear_anomaly(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

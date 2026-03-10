use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::ApiError,
    models::sensor::{PendingAction, Sensor},
};

#[derive(Deserialize)]
pub struct ActionUpdateInput {
    pub firmware_id: Uuid,
}

pub async fn update_firmware(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<ActionUpdateInput>,
) -> Result<Json<Sensor>, ApiError> {
    // Verify the target firmware exists before scheduling the action
    db::firmware::find_by_id(&state.pool, input.firmware_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Firmware '{}' not found", input.firmware_id)))?;

    let sensor = db::sensors::set_pending_action(
        &state.pool,
        id,
        PendingAction::UpdateFirmware,
        Some(input.firmware_id),
    )
    .await?
    .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

pub async fn reboot(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::set_pending_action(
        &state.pool,
        id,
        PendingAction::Reboot,
        None, // REBOOT clears any pending firmware
    )
    .await?
    .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

pub async fn clear_anomaly(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::clear_anomaly(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

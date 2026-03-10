use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::ApiError,
    models::sensor::PendingAction,
};

#[derive(Serialize)]
pub struct KeepAliveResponse {
    pub action: PendingAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_firmware_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_link: Option<String>,
}

pub async fn keepalive(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<KeepAliveResponse>, ApiError> {
    let pending = db::sensors::keepalive(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    let response = match pending.pending_action {
        PendingAction::UpdateFirmware => {
            let firmware_id = pending.pending_firmware_id.ok_or_else(|| {
                ApiError::Internal("UPDATE_FIRMWARE action is missing firmware ID".to_string())
            })?;
            KeepAliveResponse {
                action: PendingAction::UpdateFirmware,
                target_firmware_id: Some(firmware_id),
                download_link: Some(format!(
                    "{}/firmwares/download/{}",
                    state.base_url, firmware_id
                )),
            }
        }
        action => KeepAliveResponse {
            action,
            target_firmware_id: None,
            download_link: None,
        },
    };

    Ok(Json(response))
}

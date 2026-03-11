use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, ToSchema)]
#[sqlx(type_name = "anomaly_status_enum", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnomalyStatus {
    None,
    Detected,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, ToSchema)]
#[sqlx(type_name = "pending_action_enum", rename_all = "SCREAMING_SNAKE_CASE")]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PendingAction {
    None,
    Reboot,
    UpdateFirmware,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Sensor {
    pub id: Uuid,
    pub name: String,
    pub ultimo_keepalive: Option<DateTime<Utc>>,
    pub current_firmware_id: Option<Uuid>,
    pub anomaly_status: AnomalyStatus,
    pub pending_action: PendingAction,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SensorInput {
    pub name: String,
}

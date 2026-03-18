use std::collections::HashMap;

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
    pub district: String,
    pub ultimo_keepalive: Option<DateTime<Utc>>,
    pub current_firmware_id: Option<Uuid>,
    pub anomaly_status: AnomalyStatus,
    pub pending_action: PendingAction,
    /// True when a firmware has been staged via the update-firmware action
    /// but the sensor has not yet rebooted to apply it.
    pub firmware_update_pending: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SensorInput {
    pub name: String,
    pub district: String,
    /// Firmware currently installed on this sensor at registration time (optional)
    pub firmware_id: Option<Uuid>,
}

/// Partial update — all fields optional, only provided ones are changed.
#[derive(Debug, Deserialize, ToSchema)]
pub struct SensorPatch {
    pub name: Option<String>,
    pub district: Option<String>,
}

/// Aggregate statistics across all sensors.
#[derive(Debug, Serialize, ToSchema)]
pub struct SensorStats {
    pub total: i64,
    /// Sensors with a keepalive in the last 5 minutes
    pub online: i64,
    pub offline: i64,
    pub with_anomaly: i64,
    pub by_district: HashMap<String, i64>,
}

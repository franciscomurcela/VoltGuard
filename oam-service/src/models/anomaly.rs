use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Deserialize, ToSchema)]
pub struct AnomalyInput {
    pub description: String,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct AnomalyLog {
    pub id: Uuid,
    pub sensor_id: Uuid,
    pub description: String,
    pub detected_at: DateTime<Utc>,
}

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Firmware {
    pub id: Uuid,
    pub version: String,
    pub uploaded_at: DateTime<Utc>,
}

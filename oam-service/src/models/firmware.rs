use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Firmware {
    pub id: Uuid,
    pub version: String,
    pub uploaded_at: DateTime<Utc>,
    // Internal — used by download handler, not exposed in API responses
    #[serde(skip)]
    pub file_path: String,
}

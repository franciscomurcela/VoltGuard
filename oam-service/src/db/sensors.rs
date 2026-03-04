use uuid::Uuid;

use crate::db::DbPool;
use crate::models::sensor::Sensor;

const SELECT_FIELDS: &str =
    "id, name, ultimo_keepalive, current_firmware_id, anomaly_status, pending_action, pending_firmware_id";

pub async fn insert(pool: &DbPool, name: &str) -> Result<Sensor, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "INSERT INTO sensors (name) VALUES ($1) RETURNING {SELECT_FIELDS}"
    ))
    .bind(name)
    .fetch_one(pool)
    .await
}

pub async fn find_all(pool: &DbPool, limit: i64, offset: i64) -> Result<Vec<Sensor>, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "SELECT {SELECT_FIELDS} FROM sensors ORDER BY created_at DESC LIMIT $1 OFFSET $2"
    ))
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Sensor>, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "SELECT {SELECT_FIELDS} FROM sensors WHERE id = $1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn delete(pool: &DbPool, id: Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM sensors WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

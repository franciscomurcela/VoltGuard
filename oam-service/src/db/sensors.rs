use uuid::Uuid;

use crate::db::DbPool;
use crate::models::sensor::{AnomalyStatus, PendingAction, Sensor};

const SELECT_FIELDS: &str =
    "id, name, district, ultimo_keepalive, current_firmware_id, anomaly_status, pending_action";

pub async fn insert(
    pool: &DbPool,
    name: &str,
    district: &str,
    firmware_id: Option<Uuid>,
) -> Result<Sensor, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "INSERT INTO sensors (name, district, current_firmware_id)
         VALUES ($1, $2, $3) RETURNING {SELECT_FIELDS}"
    ))
    .bind(name)
    .bind(district)
    .bind(firmware_id)
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

pub async fn set_pending_action(
    pool: &DbPool,
    id: Uuid,
    action: PendingAction,
    firmware_id: Option<Uuid>,
) -> Result<Option<Sensor>, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "UPDATE sensors SET pending_action = $1, pending_firmware_id = $2
         WHERE id = $3 RETURNING {SELECT_FIELDS}"
    ))
    .bind(action)
    .bind(firmware_id)
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Internal type used only by the keepalive flow to capture state before clearing it.
#[derive(sqlx::FromRow)]
pub struct PendingState {
    pub pending_action: PendingAction,
    pub pending_firmware_id: Option<Uuid>,
}

/// Atomically updates `ultimo_keepalive` and returns + clears any pending action.
/// Uses FOR UPDATE to prevent concurrent keepalives from delivering the same action twice.
pub async fn keepalive(pool: &DbPool, id: Uuid) -> Result<Option<PendingState>, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let state = sqlx::query_as::<_, PendingState>(
        "SELECT pending_action, pending_firmware_id FROM sensors WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    if state.is_none() {
        return Ok(None); // tx dropped here → implicit rollback
    }

    // If delivering UPDATE_FIRMWARE, apply pending_firmware_id → current_firmware_id atomically
    sqlx::query(
        "UPDATE sensors
         SET ultimo_keepalive        = NOW(),
             pending_action          = 'NONE',
             current_firmware_id     = CASE
                                         WHEN pending_action = 'UPDATE_FIRMWARE'
                                         THEN pending_firmware_id
                                         ELSE current_firmware_id
                                       END,
             pending_firmware_id     = NULL
         WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(state)
}

pub async fn clear_anomaly(pool: &DbPool, id: Uuid) -> Result<Option<Sensor>, sqlx::Error> {
    sqlx::query_as::<_, Sensor>(&format!(
        "UPDATE sensors SET anomaly_status = $1
         WHERE id = $2 RETURNING {SELECT_FIELDS}"
    ))
    .bind(AnomalyStatus::None)
    .bind(id)
    .fetch_optional(pool)
    .await
}

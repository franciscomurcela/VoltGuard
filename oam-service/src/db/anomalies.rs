use uuid::Uuid;

use crate::db::DbPool;
use crate::models::anomaly::AnomalyLog;
use crate::models::sensor::AnomalyStatus;

/// Sets anomaly_status = DETECTED on the sensor and inserts a log record.
/// Both writes are wrapped in a transaction to keep the flag and log in sync.
pub async fn report(
    pool: &DbPool,
    sensor_id: Uuid,
    description: &str,
) -> Result<AnomalyLog, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE sensors SET anomaly_status = $1 WHERE id = $2")
        .bind(AnomalyStatus::Detected)
        .bind(sensor_id)
        .execute(&mut *tx)
        .await?;

    let log = sqlx::query_as::<_, AnomalyLog>(
        "INSERT INTO anomalies_log (sensor_id, description)
         VALUES ($1, $2)
         RETURNING id, sensor_id, description, detected_at",
    )
    .bind(sensor_id)
    .bind(description)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(log)
}

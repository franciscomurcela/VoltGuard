use uuid::Uuid;

use crate::db::DbPool;
use crate::models::firmware::Firmware;

pub async fn insert(
    pool: &DbPool,
    id: Uuid,
    version: &str,
    file_path: &str,
) -> Result<Firmware, sqlx::Error> {
    sqlx::query_as::<_, Firmware>(
        "INSERT INTO firmwares (id, version, file_path) VALUES ($1, $2, $3)
         RETURNING id, version, file_path, uploaded_at",
    )
    .bind(id)
    .bind(version)
    .bind(file_path)
    .fetch_one(pool)
    .await
}

pub async fn find_all(pool: &DbPool) -> Result<Vec<Firmware>, sqlx::Error> {
    sqlx::query_as::<_, Firmware>(
        "SELECT id, version, file_path, uploaded_at FROM firmwares ORDER BY uploaded_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &DbPool, id: Uuid) -> Result<Option<Firmware>, sqlx::Error> {
    sqlx::query_as::<_, Firmware>(
        "SELECT id, version, file_path, uploaded_at FROM firmwares WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::ApiError,
    models::sensor::{Sensor, SensorInput},
};

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<SensorInput>,
) -> Result<(StatusCode, Json<Sensor>), ApiError> {
    if input.name.trim().is_empty() {
        return Err(ApiError::BadRequest("name cannot be empty".to_string()));
    }

    let sensor = db::sensors::insert(&state.pool, &input.name).await?;
    Ok((StatusCode::CREATED, Json(sensor)))
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<PaginationQuery>,
) -> Result<Json<Vec<Sensor>>, ApiError> {
    let limit = params.limit.unwrap_or(10).clamp(1, 100);
    let offset = (params.page.unwrap_or(1) - 1) * limit;

    let sensors = db::sensors::find_all(&state.pool, limit, offset).await?;
    Ok(Json(sensors))
}

pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;
    Ok(Json(sensor))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let deleted = db::sensors::delete(&state.pool, id).await?;
    if deleted {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound(format!("Sensor '{}' not found", id)))
    }
}

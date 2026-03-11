use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::sensor::{Sensor, SensorInput, SensorPatch, SensorStats},
};

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[utoipa::path(
    post,
    path = "/sensors",
    request_body = SensorInput,
    responses(
        (status = 201, description = "Sensor created", body = Sensor),
        (status = 400, description = "Invalid input", body = ErrorBody),
        (status = 409, description = "Name already exists", body = ErrorBody),
    ),
    tag = "Sensors",
)]
pub async fn create(
    State(state): State<AppState>,
    Json(input): Json<SensorInput>,
) -> Result<(StatusCode, Json<Sensor>), ApiError> {
    if input.name.trim().is_empty() {
        return Err(ApiError::BadRequest("name cannot be empty".to_string()));
    }
    if input.district.trim().is_empty() {
        return Err(ApiError::BadRequest("district cannot be empty".to_string()));
    }

    // If an initial firmware is provided, verify it exists before registering the sensor
    if let Some(firmware_id) = input.firmware_id {
        db::firmware::find_by_id(&state.pool, firmware_id)
            .await?
            .ok_or_else(|| ApiError::NotFound(format!("Firmware '{}' not found", firmware_id)))?;
    }

    let sensor =
        db::sensors::insert(&state.pool, &input.name, &input.district, input.firmware_id).await?;
    Ok((StatusCode::CREATED, Json(sensor)))
}

#[utoipa::path(
    get,
    path = "/sensors",
    params(
        ("page" = Option<i64>, Query, description = "Page number (default: 1)"),
        ("limit" = Option<i64>, Query, description = "Items per page (default: 10, max: 100)"),
    ),
    responses(
        (status = 200, description = "List of sensors", body = Vec<Sensor>),
    ),
    tag = "Sensors",
)]
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<PaginationQuery>,
) -> Result<Json<Vec<Sensor>>, ApiError> {
    let limit = params.limit.unwrap_or(10).clamp(1, 100);
    let offset = (params.page.unwrap_or(1) - 1) * limit;

    let sensors = db::sensors::find_all(&state.pool, limit, offset).await?;
    Ok(Json(sensors))
}

#[utoipa::path(
    get,
    path = "/sensors/{id}",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    responses(
        (status = 200, description = "Sensor found", body = Sensor),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Sensors",
)]
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Sensor>, ApiError> {
    let sensor = db::sensors::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;
    Ok(Json(sensor))
}

#[utoipa::path(
    patch,
    path = "/sensors/{id}",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    request_body = SensorPatch,
    responses(
        (status = 200, description = "Sensor updated", body = Sensor),
        (status = 400, description = "Invalid input", body = ErrorBody),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Sensors",
)]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(input): Json<SensorPatch>,
) -> Result<Json<Sensor>, ApiError> {
    if input.name.as_deref().is_some_and(|n| n.trim().is_empty()) {
        return Err(ApiError::BadRequest("name cannot be empty".to_string()));
    }
    if input.district.as_deref().is_some_and(|d| d.trim().is_empty()) {
        return Err(ApiError::BadRequest("district cannot be empty".to_string()));
    }

    let sensor = db::sensors::update(&state.pool, id, input.name.as_deref(), input.district.as_deref())
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Sensor '{}' not found", id)))?;

    Ok(Json(sensor))
}

#[utoipa::path(
    delete,
    path = "/sensors/{id}",
    params(
        ("id" = Uuid, Path, description = "Sensor ID"),
    ),
    responses(
        (status = 204, description = "Sensor deleted"),
        (status = 404, description = "Sensor not found", body = ErrorBody),
    ),
    tag = "Sensors",
)]
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

#[utoipa::path(
    get,
    path = "/sensors/stats",
    responses(
        (status = 200, description = "Aggregate sensor statistics", body = SensorStats),
    ),
    tag = "Sensors",
)]
pub async fn stats(State(state): State<AppState>) -> Result<Json<SensorStats>, ApiError> {
    let stats = db::sensors::stats(&state.pool).await?;
    Ok(Json(stats))
}

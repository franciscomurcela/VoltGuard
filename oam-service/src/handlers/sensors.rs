use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::sensor::{Sensor, SensorInput, SensorPatch, SensorStats},
};

// ─── CSV Import types ─────────────────────────────────────────────────────────

/// Schema-only struct to document the CSV multipart upload in Swagger UI.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct SensorImportRequest {
    /// CSV file with columns: name, district, firmware_id (firmware optional)
    #[schema(format = Binary, content_media_type = "text/csv")]
    pub file: Vec<u8>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ImportRowError {
    /// 1-based row number in the CSV (header row excluded)
    pub row: usize,
    pub name: String,
    pub reason: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ImportResult {
    pub created: Vec<Sensor>,
    pub failed: Vec<ImportRowError>,
}

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
    operation_id = "list_sensors",
    params(
        ("page" = Option<i64>, Query, description = "Page number (default: 1)"),
        ("limit" = Option<i64>, Query, description = "Items per page (default: 10, max: 100)"),
    ),
    responses(
        (status = 200, description = "List of sensors (total count in X-Total-Count header)", body = Vec<Sensor>),
    ),
    tag = "Sensors",
)]
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<PaginationQuery>,
) -> Result<(HeaderMap, Json<Vec<Sensor>>), ApiError> {
    let limit = params.limit.unwrap_or(10).clamp(1, 100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let (total, sensors) = tokio::try_join!(
        db::sensors::count(&state.pool),
        db::sensors::find_all(&state.pool, limit, offset),
    )?;

    let mut headers = HeaderMap::new();
    headers.insert(
        header::HeaderName::from_static("x-total-count"),
        HeaderValue::from(total),
    );

    Ok((headers, Json(sensors)))
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
        (status = 409, description = "Name already taken", body = ErrorBody),
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

#[utoipa::path(
    post,
    path = "/sensors/import",
    request_body(content = SensorImportRequest, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Import complete — see created and failed arrays", body = ImportResult),
        (status = 400, description = "Missing file field or invalid UTF-8", body = ErrorBody),
    ),
    tag = "Sensors",
)]
pub async fn import(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ImportResult>, ApiError> {
    // ── 1. Read the CSV bytes ────────────────────────────────────────────────
    let mut csv_text: Option<String> = None;

    while let Some(field) = multipart.next_field().await? {
        if field.name().unwrap_or("") == "file" {
            let bytes = field.bytes().await?;
            csv_text = Some(
                String::from_utf8(bytes.to_vec())
                    .map_err(|_| ApiError::BadRequest("CSV file must be valid UTF-8".to_string()))?,
            );
            break;
        }
    }

    let text = csv_text
        .ok_or_else(|| ApiError::BadRequest("file field is required".to_string()))?;

    // ── 2. Parse rows and insert ─────────────────────────────────────────────
    let mut created = Vec::new();
    let mut failed = Vec::new();
    let mut data_row = 0; // counts non-header, non-blank rows

    for line in text.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        // Skip header row (first non-blank line starting with "name")
        if data_row == 0 && trimmed.to_lowercase().starts_with("name") {
            continue;
        }

        data_row += 1;
        let row_num = data_row;

        let cols: Vec<&str> = trimmed.splitn(3, ',').map(str::trim).collect();

        let name = cols.first().copied().unwrap_or("");
        let district = cols.get(1).copied().unwrap_or("");
        let firmware_str = cols.get(2).copied().unwrap_or("").trim();

        if name.is_empty() {
            failed.push(ImportRowError {
                row: row_num,
                name: name.to_string(),
                reason: "name is required".to_string(),
            });
            continue;
        }

        if district.is_empty() {
            failed.push(ImportRowError {
                row: row_num,
                name: name.to_string(),
                reason: "district is required".to_string(),
            });
            continue;
        }

        // Parse optional firmware UUID
        let firmware_id = if firmware_str.is_empty() {
            None
        } else {
            match Uuid::parse_str(firmware_str) {
                Ok(id) => Some(id),
                Err(_) => {
                    failed.push(ImportRowError {
                        row: row_num,
                        name: name.to_string(),
                        reason: format!("invalid firmware_id '{}'", firmware_str),
                    });
                    continue;
                }
            }
        };

        // Verify firmware exists before inserting the sensor
        if let Some(fw_id) = firmware_id {
            match db::firmware::find_by_id(&state.pool, fw_id).await? {
                Some(_) => {}
                None => {
                    failed.push(ImportRowError {
                        row: row_num,
                        name: name.to_string(),
                        reason: format!("firmware '{}' not found", fw_id),
                    });
                    continue;
                }
            }
        }

        match db::sensors::insert(&state.pool, name, district, firmware_id).await {
            Ok(sensor) => created.push(sensor),
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
                failed.push(ImportRowError {
                    row: row_num,
                    name: name.to_string(),
                    reason: "name already exists".to_string(),
                });
            }
            Err(e) => return Err(ApiError::Internal(e.to_string())),
        }
    }

    Ok(Json(ImportResult { created, failed }))
}

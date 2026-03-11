use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    db::{self, AppState},
    error::{ApiError, ErrorBody},
    models::firmware::Firmware,
};

/// Schema-only struct to document the multipart upload fields in Swagger UI.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct FirmwareUploadRequest {
    /// Firmware version string (e.g. "v1.2.0")
    pub version: String,
    /// Binary firmware file
    #[schema(format = Binary, content_media_type = "application/octet-stream")]
    pub file: Vec<u8>,
}

#[utoipa::path(
    post,
    path = "/firmwares",
    request_body(content = FirmwareUploadRequest, content_type = "multipart/form-data"),
    responses(
        (status = 201, description = "Firmware uploaded"),
        (status = 400, description = "Missing or invalid fields", body = ErrorBody),
        (status = 409, description = "Version already exists", body = ErrorBody),
    ),
    tag = "Firmware",
)]
pub async fn upload(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<StatusCode, ApiError> {
    let mut version: Option<String> = None;
    let mut file_path: Option<String> = None;
    let firmware_id = Uuid::new_v4();

    while let Some(mut field) = multipart.next_field().await? {
        // Collect name as owned string to drop the borrow before consuming the field
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "version" => {
                version = Some(field.text().await?);
            }
            "file" => {
                let path = format!("{}/{}.bin", state.firmware_storage_path, firmware_id);
                let mut file = tokio::fs::File::create(&path)
                    .await
                    .map_err(|e| ApiError::Internal(e.to_string()))?;

                while let Some(chunk) = field.chunk().await? {
                    file.write_all(&chunk)
                        .await
                        .map_err(|e| ApiError::Internal(e.to_string()))?;
                }

                file_path = Some(path);
            }
            _ => {}
        }
    }

    let version = version
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| ApiError::BadRequest("version field is required".to_string()))?;

    let file_path = file_path
        .ok_or_else(|| ApiError::BadRequest("file field is required".to_string()))?;

    // If DB insert fails (e.g. duplicate version), clean up the file we just wrote
    let result = db::firmware::insert(&state.pool, firmware_id, &version, &file_path).await;
    if result.is_err() {
        tokio::fs::remove_file(&file_path).await.ok();
    }
    result?;

    Ok(StatusCode::CREATED)
}

#[utoipa::path(
    get,
    path = "/firmwares",
    responses(
        (status = 200, description = "List of firmwares", body = Vec<Firmware>),
    ),
    tag = "Firmware",
)]
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Firmware>>, ApiError> {
    let firmwares = db::firmware::find_all(&state.pool).await?;
    Ok(Json(firmwares))
}

#[utoipa::path(
    get,
    path = "/firmwares/download/{id}",
    params(
        ("id" = Uuid, Path, description = "Firmware ID"),
    ),
    responses(
        (status = 200, description = "Firmware binary file", content_type = "application/octet-stream"),
        (status = 404, description = "Firmware not found", body = ErrorBody),
    ),
    tag = "Firmware",
)]
pub async fn download(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Response, ApiError> {
    let firmware = db::firmware::find_by_id(&state.pool, id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Firmware '{}' not found", id)))?;

    let file = tokio::fs::File::open(&firmware.file_path)
        .await
        .map_err(|_| ApiError::NotFound(format!("Firmware file for '{}' not found on disk", id)))?;

    let body = Body::from_stream(ReaderStream::new(file));

    Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}.bin\"", firmware.version),
        )
        .body(body)
        .map_err(|e| ApiError::Internal(e.to_string()))
}

use axum::{
    extract::multipart::MultipartError,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("Not Found")]
    NotFound(String),
    #[error("Bad Request")]
    BadRequest(String),
    #[error("Conflict")]
    Conflict(String),
    #[error("Internal Server Error")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
    message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error, message) = match &self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, "Not Found", msg.clone()),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "Bad Request", msg.clone()),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, "Conflict", msg.clone()),
            ApiError::Internal(msg) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Internal Server Error",
                msg.clone(),
            ),
        };

        (status, Json(ErrorBody { error: error.to_string(), message })).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => ApiError::NotFound("Resource not found".to_string()),
            sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                ApiError::Conflict(db_err.message().to_string())
            }
            _ => ApiError::Internal(e.to_string()),
        }
    }
}

impl From<MultipartError> for ApiError {
    fn from(e: MultipartError) -> Self {
        ApiError::BadRequest(e.to_string())
    }
}

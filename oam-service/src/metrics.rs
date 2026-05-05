use axum::{response::IntoResponse, Json};
use once_cell::sync::Lazy;
use prometheus::{Encoder, IntCounterVec, Opts, Registry, TextEncoder};
use std::collections::HashMap;

static REGISTRY: Lazy<Registry> = Lazy::new(|| Registry::new());
static HTTP_REQUESTS: Lazy<IntCounterVec> = Lazy::new(|| {
    let opts = Opts::new("http_requests_total", "Total HTTP requests");
    let c = IntCounterVec::new(opts, &["method", "path", "status"]).expect("metric");
    REGISTRY.register(Box::new(c.clone())).ok();
    c
});

pub fn init_metrics() {
    // Accessing the statics will initialize and register them
    Lazy::force(&REGISTRY);
    Lazy::force(&HTTP_REQUESTS);
}

pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    ([("Content-Type", encoder.format_type().to_string())], buffer)
}

pub fn inc_request(method: &str, path: &str, status: &str) {
    HTTP_REQUESTS.with_label_values(&[method, path, status]).inc();
}

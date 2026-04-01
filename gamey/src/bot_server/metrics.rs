use axum::{http::header::CONTENT_TYPE, response::{IntoResponse, Response}};
use once_cell::sync::Lazy;
use prometheus::{Encoder, HistogramVec, TextEncoder, register_histogram_vec};
use std::time::Instant;

pub static INFERENCE_LATENCY: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "gamey_inference_latency_seconds",
        "ONNX bot inference latency in seconds",
        &["bot_id"],
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
    )
        .expect("failed to register gamey_inference_latency_seconds")
});

pub fn start_inference_timer() -> Instant {
    Instant::now()
}

pub fn observe_inference_latency(bot_id: &str, start: Instant) {
    let elapsed = start.elapsed().as_secs_f64();
    INFERENCE_LATENCY.with_label_values(&[bot_id]).observe(elapsed);
}

pub async fn metrics_handler() -> Response {
    let metric_families = prometheus::gather();
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();

    if encoder.encode(&metric_families, &mut buffer).is_err() {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, String::new()).into_response();
    }

    let body = String::from_utf8(buffer).unwrap_or_default();
    (
        [(CONTENT_TYPE, encoder.format_type().to_string())],
        body,
    )
        .into_response()
}
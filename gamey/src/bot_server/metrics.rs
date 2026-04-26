use axum::{http::header::CONTENT_TYPE, response::{IntoResponse, Response}};
use once_cell::sync::Lazy;
use prometheus::{register_histogram_vec, Encoder, HistogramVec, TextEncoder};
use std::time::Instant;

pub static INFERENCE_LATENCY: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "gamey_inference_latency_seconds",
        "Deprecated compatibility metric for bot move latency in seconds",
        &["bot_id"],
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
    )
        .expect("failed to register gamey_inference_latency_seconds")
});

pub static BOT_MOVE_DURATION: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "gamey_bot_move_duration_seconds",
        "Full bot move duration in seconds",
        &["endpoint", "bot_id"],
        vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0]
    )
    .expect("failed to register gamey_bot_move_duration_seconds")
});

pub fn start_inference_timer() -> Instant {
    Instant::now()
}

pub fn observe_inference_latency(bot_id: &str, start: Instant) {
    let elapsed = start.elapsed().as_secs_f64();
    INFERENCE_LATENCY.with_label_values(&[bot_id]).observe(elapsed);
}

pub fn observe_bot_move_duration(endpoint: &str, bot_id: &str, start: Instant) {
    let elapsed = start.elapsed().as_secs_f64();
    BOT_MOVE_DURATION
        .with_label_values(&[endpoint, bot_id])
        .observe(elapsed);
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
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn start_inference_timer_returns_instant() {
        let t = start_inference_timer();
        std::thread::sleep(std::time::Duration::from_millis(1));
        assert!(t.elapsed().as_nanos() > 0);
    }

    #[test]
    fn observe_inference_latency_does_not_panic() {
        let start = start_inference_timer();
        std::thread::sleep(Duration::from_millis(1));
        observe_inference_latency("test_bot", start);
    }

    #[test]
    fn observe_inference_latency_records_positive_value() {
        let start = start_inference_timer();
        std::thread::sleep(Duration::from_millis(5));
        observe_inference_latency("test_bot_2", start);

        let families = prometheus::gather();
        let found = families.iter().any(|f| f.get_name() == "gamey_inference_latency_seconds");
        assert!(found, "metric gamey_inference_latency_seconds not found in registry");
    }

    #[test]
    fn observe_multiple_bots_records_independently() {
        let s1 = start_inference_timer();
        let s2 = start_inference_timer();
        observe_inference_latency("bot_alpha", s1);
        observe_inference_latency("bot_beta", s2);

        let families = prometheus::gather();
        let latency_family = families.iter()
            .find(|f| f.get_name() == "gamey_inference_latency_seconds");
        assert!(latency_family.is_some());
    }

    #[test]
    fn observe_bot_move_duration_records_endpoint_and_bot_labels() {
        let start = start_inference_timer();
        std::thread::sleep(Duration::from_millis(2));
        observe_bot_move_duration("choose", "easy_fast", start);

        let families = prometheus::gather();
        let found = families
            .iter()
            .any(|family| family.get_name() == "gamey_bot_move_duration_seconds");
        assert!(found, "metric gamey_bot_move_duration_seconds not found in registry");
    }

    #[tokio::test]
    async fn metrics_handler_returns_200_with_content_type() {
        let response = metrics_handler().await;
        let status = response.status();
        assert_eq!(status, axum::http::StatusCode::OK);

        let ct = response.headers()
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(ct.contains("text/plain"), "unexpected content-type: {ct}");
    }

    #[tokio::test]
    async fn metrics_handler_body_contains_gamey_metric() {
        use http_body_util::BodyExt;

        observe_inference_latency("handler_test_bot", start_inference_timer());

        let response = metrics_handler().await;
        let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = String::from_utf8(body_bytes.to_vec()).unwrap();
        assert!(body.contains("gamey_inference_latency_seconds"),
                "body missing expected metric:\n{body}");
    }

    #[tokio::test]
    async fn metrics_handler_body_contains_gamey_bot_move_metric() {
        use http_body_util::BodyExt;

        observe_bot_move_duration("play", "test_bot", start_inference_timer());

        let response = metrics_handler().await;
        let body_bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = String::from_utf8(body_bytes.to_vec()).unwrap();
        assert!(
            body.contains("gamey_bot_move_duration_seconds"),
            "body missing expected metric:\n{body}"
        );
    }
}

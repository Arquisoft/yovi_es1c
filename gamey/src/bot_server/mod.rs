//! HTTP server for Y game bots.
//!
//! This module provides an Axum-based REST API for querying Y game bots.
//! The server exposes endpoints for checking bot status and requesting moves.
//!
//! # Endpoints
//! - `GET /status` - Health check endpoint
//! - `POST /{api_version}/ybot/choose/{bot_id}` - Request a move from a bot
//!
//! # Example
//! ```no_run
//! use gamey::run_bot_server;
//!
//! #[tokio::main]
//! async fn main() {
//!     if let Err(e) = run_bot_server(3000).await {
//!         eprintln!("Server error: {}", e);
//!     }
//! }
//! ```

pub mod choose;
pub mod error;
pub mod state;
pub mod version;
pub mod bot_alias_resolver;

use std::collections::HashMap;
use axum::response::IntoResponse;
use std::sync::Arc;
pub use choose::MoveResponse;
pub use error::ErrorResponse;
pub use version::*;
use tower_http::cors::{CorsLayer, Any};

use crate::{GameYError, RandomBot, YBotRegistry, state::AppState};
use crate::bot::set_based_heuristic::SetBasedHeuristic;
use crate::bot_server::bot_alias_resolver::BotAliasResolver;
use crate::minimax::MinimaxBot;
use crate::bot::neural_net::NeuralNet;
use crate::bot::neural_mcts::NeuralMctsBot;

/// Creates the Axum router with the given state.
///
/// This is useful for testing the API without binding to a network port.
pub fn create_router(state: AppState) -> axum::Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    axum::Router::new()
        .route("/status", axum::routing::get(status))
        .route(
            "/{api_version}/ybot/choose/{bot_id}",
            axum::routing::post(choose::choose),
        )
        .layer(cors)
        .with_state(state)
}

/// Creates the default application state with the standard bot registry.
///
/// The default state includes the `RandomBot` which selects moves randomly.
pub fn create_default_state() -> AppState {
    // Carga el modelo ONNX una sola vez y lo comparte entre los tres niveles
    let net = NeuralNet::load("models/yovi_model.onnx")
        .expect("No se encontró models/yovi_model.onnx — ejecuta training/train.py primero");

    let bots = YBotRegistry::new()
        .with_bot(Arc::new(RandomBot))
        .with_bot(Arc::new(MinimaxBot::new(SetBasedHeuristic, 2)))
        .with_bot(Arc::new(MinimaxBot::new(SetBasedHeuristic, 4)))
        .with_bot(Arc::new(NeuralMctsBot::new(net.clone(), 200)))
        .with_bot(Arc::new(NeuralMctsBot::new(net.clone(), 800)))
        .with_bot(Arc::new(NeuralMctsBot::new(net.clone(), 2000)));

    let mut aliases = HashMap::new();
    aliases.insert("easy".to_string(),   "random".to_string());
    aliases.insert("medium".to_string(), "minimax_set_d2".to_string());
    aliases.insert("hard".to_string(),   "minimax_set_d4".to_string());
    aliases.insert("expert".to_string(), "neural_mcts_s800".to_string());

    let resolver = BotAliasResolver::new(aliases);
    AppState::new(bots, resolver)
}


/// Starts the bot server on the specified port.
///
/// This function blocks until the server is shut down.
///
/// # Arguments
/// * `port` - The TCP port to listen on
///
/// # Errors
/// Returns `GameYError::ServerError` if:
/// - The TCP port cannot be bound (e.g., port already in use, permission denied)
/// - The server encounters an error while running
pub async fn run_bot_server(port: u16) -> Result<(), GameYError> {
    let state = create_default_state();
    let app = create_router(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| GameYError::ServerError {
            message: format!("Failed to bind to {}: {}", addr, e),
        })?;

    println!("Server mode: Listening on http://{}", addr);
    axum::serve(listener, app)
        .await
        .map_err(|e| GameYError::ServerError {
            message: format!("Server error: {}", e),
        })?;

    Ok(())
}

/// Health check endpoint handler.
///
/// Returns "OK" to indicate the server is running.
pub async fn status() -> impl IntoResponse {
    "OK"
}
// ─────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    use serde_json::json;

    fn test_router_random_only() -> axum::Router {
        use crate::{RandomBot, YBotRegistry};
        use std::collections::HashMap;

        let bots = YBotRegistry::new().with_bot(Arc::new(RandomBot));
        let aliases: HashMap<String, String> = HashMap::new();
        let resolver = BotAliasResolver::new(aliases);
        let state = AppState::new(bots, resolver);

        create_router(state)
    }

    #[tokio::test]
    async fn test_status_endpoint_returns_ok() {
        let app = test_router_random_only();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(&body[..], b"OK");
    }

    #[tokio::test]
    async fn test_choose_move_unknown_bot_returns_error() {
        let app = test_router_random_only();
        let body_json = json!({
            "yen": {
                "size": 3,
                "turn": 0,
                "players": ["B", "R"],
                "layout": "./../..."
            }
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/nonexistent_bot")
                    .header("content-type", "application/json")
                    .body(Body::from(body_json.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response.status().is_client_error());
    }

    #[tokio::test]
    async fn test_choose_move_random_bot_returns_coordinates() {
        let app = test_router_random_only();

        // Serializamos directamente un tablero válido usando las estructuras del core
        let board = crate::GameY::new(3);
        let yen: crate::YEN = (&board).into();
        let body_string = serde_json::to_string(&yen).unwrap();

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/random")
                    .header("content-type", "application/json")
                    .body(Body::from(body_string))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let json_resp: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

        assert!(
            json_resp.get("x").is_some() || json_resp.get("coords").is_some(),
            "La respuesta debe contener coordenadas"
        );
    }

    #[test]
    fn test_default_state_registers_neural_bots() {
        let state = create_default_state();
        let _ = state;
    }
}




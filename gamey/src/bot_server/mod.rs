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

pub mod bot_alias_resolver;
pub mod choose;
pub mod error;
pub mod metrics;
pub mod play;
pub mod play_competition;
pub mod runtime_config;
pub mod state;
pub mod version;

use axum::response::IntoResponse;
pub use choose::MoveResponse;
pub use error::ErrorResponse;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
pub use version::*;

use crate::bot::neural_mcts::NeuralMctsBot;
use crate::bot::neural_net::NeuralNet;
use crate::bot::set_based_heuristic::SetBasedHeuristic;
use crate::bot_server::bot_alias_resolver::BotAliasResolver;
use crate::bot_server::runtime_config::{BotServerRuntimeConfig, init_rayon_pool};
use crate::minimax::MinimaxBot;
use crate::set_connectivity_heuristic::SetConnectivityHeuristic;
use crate::{BalancedHeuristic, GameYError, RandomBot, YBotRegistry, state::AppState};
use crate::bot::montecarlo::MontecarloBot;
use crate::both_players_set_distances_heuristic::BotPlayersSetDistancesHeuristic;

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
        .route("/metrics", axum::routing::get(metrics::metrics_handler))
        .route(
            "/{api_version}/ybot/choose/{bot_id}",
            axum::routing::post(choose::choose),
        )
        .route("/{api_version}/ybot/play", axum::routing::post(play::play))
        .route(
            "/play",
            axum::routing::get(play_competition::play_competition),
        )
        .layer(cors)
        .with_state(state)
}

/// Creates the default application state with the standard bot registry.
///
/// The default state includes the `RandomBot` which selects moves randomly.
pub fn create_default_state() -> AppState {
    let runtime_config = BotServerRuntimeConfig::from_env();
    init_rayon_pool(runtime_config.rayon_threads);

    // Carga el modelo ONNX una sola vez y lo comparte entre los tres niveles
    let net = NeuralNet::load("models/yovi_model.onnx").unwrap_or_else(|err| {
        panic!(
            "No se pudo cargar models/yovi_model.onnx. Si no existe, ejecuta training/train.py primero. Error: {err:#}"
        )
    });

    let mut bots = YBotRegistry::new()
        .with_bot(Arc::new(RandomBot))
        .with_bot(Arc::new(MinimaxBot::new(BotPlayersSetDistancesHeuristic, 3)))
        .with_bot(Arc::new(MontecarloBot { simulations: 120 }))
        .with_bot(Arc::new(MinimaxBot::new(SetConnectivityHeuristic, 4)));

    let mut neural_ids = HashSet::new();
    for neural_config in [runtime_config.expert_fast, runtime_config.expert] {
        let bot_id = neural_config.bot_id();
        if neural_ids.insert(bot_id) {
            bots = bots.with_bot(Arc::new(
                NeuralMctsBot::new(net.clone(), neural_config.simulations).with_early_stop(
                    neural_config.early_stop.visit_ratio,
                    neural_config.early_stop.min_visits,
                ),
            ));
        }
    }
    if neural_ids.insert("neural_mcts_s2000".to_string()) {
        bots = bots.with_bot(Arc::new(
            NeuralMctsBot::new(net.clone(), 2000).with_early_stop(0.62, 160),
        ));
    }

    let mut aliases = HashMap::new();
    aliases.insert("easy".to_string(), "random".to_string());
    aliases.insert("medium".to_string(), "minimax_opposing_set_d3".to_string());
    aliases.insert("hard".to_string(), "montecarlo".to_string());
    aliases.insert("expert".to_string(), runtime_config.expert.bot_id());
    aliases.insert(
        "expert_fast".to_string(),
        runtime_config.expert_fast.bot_id(),
    );

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
    let listener =
        tokio::net::TcpListener::bind(&addr)
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
    use crate::bot_server::runtime_config::ENV_GUARD;
    use crate::{Coordinates, GameY, Movement, PlayerId, YBot};
    use serde_json::json;
    use std::collections::HashSet;
    use tower::ServiceExt;

    fn test_router_random_only() -> axum::Router {
        use crate::{RandomBot, YBotRegistry};
        use std::collections::HashMap;

        let bots = YBotRegistry::new().with_bot(Arc::new(RandomBot));
        let aliases: HashMap<String, String> = HashMap::new();
        let resolver = BotAliasResolver::new(aliases);
        let state = AppState::new(bots, resolver);

        create_router(state)
    }

    fn test_state_with_medium_alias() -> AppState {
        let bots = YBotRegistry::new().with_bot(Arc::new(
            MinimaxBot::new(BotPlayersSetDistancesHeuristic, 3).with_variety(3, 160),
        ));
        let aliases = HashMap::from([(
            "medium".to_string(),
            "minimax_opposing_set_d3".to_string(),
        )]);
        let resolver = BotAliasResolver::new(aliases);
        AppState::new(bots, resolver)
    }

    fn medium_bot() -> Arc<dyn YBot> {
        let state = test_state_with_medium_alias();
        let resolved = state.resolve_bot_id("medium").to_string();
        state
            .bots()
            .find(&resolved)
            .unwrap_or_else(|| panic!("missing medium bot resolved as {resolved}"))
    }

    fn clear_gamey_env() {
        unsafe {
            std::env::remove_var("GAMEY_RAYON_THREADS");
            std::env::remove_var("GAMEY_EXPERT_FAST_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_MIN_VISITS");
        }
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

    #[tokio::test]
    async fn test_choose_endpoint_with_partially_filled_board() {
        let app = test_router_random_only();
        let yen = crate::YEN::new(3, 2, vec!['B', 'R'], "B/R./.B.".to_string());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/random")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&yen).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let move_response: MoveResponse = serde_json::from_slice(&body_bytes).unwrap();

        assert_eq!(move_response.api_version, "v1");
        assert_eq!(move_response.bot_id, "random");
    }

    #[tokio::test]
    async fn test_choose_endpoint_with_invalid_api_version() {
        let app = test_router_random_only();
        let yen = crate::YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v2/ybot/choose/random")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&yen).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: ErrorResponse = serde_json::from_slice(&body_bytes).unwrap();

        assert!(error_response.message.contains("Unsupported API version"));
        assert_eq!(error_response.api_version, Some("v2".to_string()));
    }

    #[tokio::test]
    async fn test_choose_endpoint_with_missing_content_type() {
        let app = test_router_random_only();
        let yen = crate::YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/random")
                    .body(Body::from(serde_json::to_string(&yen).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert!(response.status().is_client_error());
    }

    #[tokio::test]
    async fn test_choose_with_custom_bot_registry() {
        let bots = YBotRegistry::new().with_bot(Arc::new(RandomBot));
        let resolver = BotAliasResolver::new(HashMap::new());
        let state = AppState::new(bots, resolver);
        let app = create_router(state);
        let yen = crate::YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/random")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&yen).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_choose_with_empty_bot_registry() {
        let state = AppState::new(YBotRegistry::new(), BotAliasResolver::new(HashMap::new()));
        let app = create_router(state);
        let yen = crate::YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/ybot/choose/random_bot")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&yen).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let error_response: ErrorResponse = serde_json::from_slice(&body_bytes).unwrap();
        assert!(error_response.message.contains("Bot not found"));
    }

    #[tokio::test]
    async fn test_unknown_route_returns_404() {
        let app = test_router_random_only();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/unknown/route")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_wrong_method_on_status_endpoint() {
        let app = test_router_random_only();

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/status")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[tokio::test]
    async fn test_get_on_choose_endpoint_returns_method_not_allowed() {
        let app = test_router_random_only();

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/v1/ybot/choose/random_bot")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[test]
    fn test_default_state_registers_neural_bots() {
        let _guard = ENV_GUARD.lock().unwrap();
        clear_gamey_env();
        let state = create_default_state();
        let _ = state;
    }

    #[test]
    fn test_default_state_exposes_expert_fast_alias() {
        let _guard = ENV_GUARD.lock().unwrap();
        clear_gamey_env();
        let state = create_default_state();
        let resolved = state.resolve_bot_id("expert_fast");
        assert_eq!(resolved, "neural_mcts_s200");
        assert!(state.bots().find(resolved).is_some());
    }

    #[test]
    fn test_default_state_maps_medium_to_balanced_minimax_bot() {
        let _guard = ENV_GUARD.lock().unwrap();
        clear_gamey_env();
        let state = create_default_state();
        let resolved = state.resolve_bot_id("medium");
        assert_eq!(resolved, "minimax_opposing_set_d3");
        assert!(state.bots().find(resolved).is_some());
    }

    #[test]
    fn test_default_state_respects_env_tuned_neural_aliases() {
        let _guard = ENV_GUARD.lock().unwrap();
        unsafe {
            std::env::set_var("GAMEY_EXPERT_FAST_SIMULATIONS", "160");
            std::env::set_var("GAMEY_EXPERT_SIMULATIONS", "320");
            std::env::set_var("GAMEY_EXPERT_FAST_EARLY_STOP_RATIO", "0.6");
            std::env::set_var("GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS", "24");
            std::env::set_var("GAMEY_EXPERT_EARLY_STOP_RATIO", "0.62");
            std::env::set_var("GAMEY_EXPERT_EARLY_STOP_MIN_VISITS", "48");
        }

        let state = create_default_state();

        assert_eq!(state.resolve_bot_id("expert_fast"), "neural_mcts_s160");
        assert_eq!(state.resolve_bot_id("expert"), "neural_mcts_s320");
        assert!(state.bots().find("neural_mcts_s160").is_some());
        assert!(state.bots().find("neural_mcts_s320").is_some());

        unsafe {
            std::env::remove_var("GAMEY_EXPERT_FAST_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_MIN_VISITS");
        }
    }

    #[test]
    fn medium_finishes_immediate_wins_instead_of_missing_them() {
        let bot = medium_bot();
        let mut board = GameY::new(3);

        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 0, 2),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(1, 1, 0),
            })
            .unwrap();

        assert_eq!(bot.choose_move(&board), Some(Coordinates::new(0, 2, 0)));
    }

    #[test]
    fn medium_blocks_obvious_one_turn_losses() {
        let bot = medium_bot();
        let mut board = GameY::new(3);

        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(1, 0, 1),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(1, 1, 0),
            })
            .unwrap();

        assert_eq!(bot.choose_move(&board), Some(Coordinates::new(0, 2, 0)));
    }

    #[test]
    fn medium_introduces_controlled_variety_on_non_forced_openings() {
        let bot = medium_bot();
        let board = GameY::new(5);

        let unique_moves: HashSet<_> = (0..9).filter_map(|_| bot.choose_move(&board)).collect();
        assert!(
            unique_moves.len() > 1,
            "medium should not always repeat the same opening move when no tactic forces a single answer"
        );
    }
}

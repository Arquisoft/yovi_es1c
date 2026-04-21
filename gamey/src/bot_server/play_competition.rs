use crate::{Coordinates, GameY, PlayerId, YEN, error::ErrorResponse, state::AppState};
use axum::{
    Json,
    extract::{Query, State},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct PlayCompetitionQuery {
    pub position: Option<String>,
    pub bot_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(untagged)]
pub enum PlayCompetitionResponse {
    Move { coords: Coordinates },
    Action { action: String },
}

pub async fn play_competition(
    State(state): State<AppState>,
    Query(query): Query<PlayCompetitionQuery>,
) -> Result<Json<PlayCompetitionResponse>, ErrorResponse> {
    let position_str = query.position.ok_or_else(|| {
        ErrorResponse::error(
            "Missing required query parameter: position",
            None,
            query.bot_id.clone(),
        )
    })?;

    let yen: YEN = serde_json::from_str(&position_str).map_err(|err| {
        ErrorResponse::error(
            &format!("Invalid position JSON: {}", err),
            None,
            query.bot_id.clone(),
        )
    })?;

    let game = GameY::try_from(yen).map_err(|err| {
        ErrorResponse::error(
            &format!("Invalid YEN format: {}", err),
            None,
            query.bot_id.clone(),
        )
    })?;

    if should_apply_pie_swap(&game) {
        return Ok(Json(PlayCompetitionResponse::Action {
            action: "swap".to_string(),
        }));
    }

    let bot_id = query.bot_id.unwrap_or_else(|| "random".to_string());
    let resolved_id = state.resolve_bot_id(&bot_id);

    let bot = state.bots().find(resolved_id).ok_or_else(|| {
        ErrorResponse::error(
            "Bot not found",
            None,
            Some(bot_id.clone()),
        )
    })?;

    let response = match bot.choose_move(&game) {
        Some(coords) => PlayCompetitionResponse::Move { coords },
        None => PlayCompetitionResponse::Action {
            action: "resign".to_string(),
        },
    };

    Ok(Json(response))
}

fn should_apply_pie_swap(game: &GameY) -> bool {
    let is_pie_enabled = game.rules().pie_rule.enabled;
    let is_second_player_turn = game.next_player() == Some(PlayerId::new(1));
    let has_single_opening_stone = game.get_board_map().len() == 1;

    is_pie_enabled && is_second_player_turn && has_single_opening_stone
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bot_server::bot_alias_resolver::BotAliasResolver;
    use crate::{GameRules, HoneyRule, Movement, PieRule, RandomBot, YBot, YBotRegistry};
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
    };
    use std::{collections::HashMap, sync::Arc};
    use tower::ServiceExt;

    struct ResignBot;

    impl YBot for ResignBot {
        fn name(&self) -> &str {
            "resign_bot"
        }

        fn choose_move(&self, _board: &GameY) -> Option<Coordinates> {
            None
        }
    }

    fn test_router() -> Router {
        let bots = YBotRegistry::new()
            .with_bot(Arc::new(RandomBot))
            .with_bot(Arc::new(ResignBot));

        let aliases = HashMap::new();
        let resolver = BotAliasResolver::new(aliases);
        let state = AppState::new(bots, resolver);

        Router::new()
            .route("/play", axum::routing::get(play_competition))
            .with_state(state)
    }

    fn to_query_encoded_position(yen: &YEN) -> String {
        let json = serde_json::to_string(yen).expect("YEN should serialize");
        percent_encode(&json)
    }

    fn percent_encode(input: &str) -> String {
        let mut encoded = String::new();
        for byte in input.bytes() {
            match byte {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(byte as char)
                }
                _ => encoded.push_str(&format!("%{:02X}", byte)),
            }
        }
        encoded
    }

    async fn response_json(response: axum::response::Response) -> serde_json::Value {
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should be readable");
        serde_json::from_slice(&body).expect("body should be valid JSON")
    }

    #[tokio::test]
    async fn play_returns_move_for_regular_position() {
        let app = test_router();
        let yen: YEN = (&GameY::new(3)).into();
        let encoded = to_query_encoded_position(&yen);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/play?position={encoded}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::OK);
        let payload = response_json(response).await;

        assert!(payload.get("coords").is_some());
        assert!(payload.get("action").is_none());
    }

    #[tokio::test]
    async fn play_returns_swap_when_pie_rule_applies() {
        let app = test_router();

        let mut game = GameY::new(3);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 0),
        })
            .expect("opening move should be valid");

        let mut yen: YEN = (&game).into();
        yen.set_rules(Some(GameRules {
            pie_rule: PieRule { enabled: true },
            honey: HoneyRule { enabled: false, blocked_cells: vec![] },
        }));
        let encoded = to_query_encoded_position(&yen);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/play?position={encoded}"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::OK);
        let payload = response_json(response).await;
        assert_eq!(payload, serde_json::json!({ "action": "swap" }));
    }

    #[tokio::test]
    async fn play_returns_resign_when_bot_has_no_moves() {
        let app = test_router();
        let yen: YEN = (&GameY::new(3)).into();
        let encoded = to_query_encoded_position(&yen);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/play?position={encoded}&bot_id=resign_bot"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::OK);
        let payload = response_json(response).await;
        assert_eq!(payload, serde_json::json!({ "action": "resign" }));
    }

    #[tokio::test]
    async fn play_returns_error_for_invalid_bot_id() {
        let app = test_router();
        let yen: YEN = (&GameY::new(3)).into();
        let encoded = to_query_encoded_position(&yen);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/play?position={encoded}&bot_id=does_not_exist"))
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let payload = response_json(response).await;
        assert_eq!(
            payload.get("message"),
            Some(&serde_json::json!("Bot not found"))
        );
    }

    #[tokio::test]
    async fn play_returns_error_for_malformed_position() {
        let app = test_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/play?position=not-json")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let payload = response_json(response).await;
        assert!(
            payload
                .get("message")
                .and_then(|m| m.as_str())
                .expect("message should be string")
                .contains("Invalid position JSON")
        );
    }

    #[tokio::test]
    async fn play_returns_error_for_missing_position() {
        let app = test_router();

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/play")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("request should complete");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let payload = response_json(response).await;
        assert_eq!(
            payload.get("message"),
            Some(&serde_json::json!(
                "Missing required query parameter: position"
            ))
        );
    }
}
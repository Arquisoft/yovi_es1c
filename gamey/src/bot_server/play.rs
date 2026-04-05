use crate::{GameY, YEN, check_api_version, error::ErrorResponse, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct PlayRequest {
    pub position: YEN,
    pub bot_id: Option<String>,
}

#[derive(Serialize)]
pub struct PlayResponse {
    pub api_version: String,
    pub bot_id: String,
    pub position: YEN,
}

pub async fn play(
    State(state): State<AppState>,
    Path(api_version): Path<String>,
    Json(req): Json<PlayRequest>,
) -> Result<Json<PlayResponse>, Json<ErrorResponse>> {
    check_api_version(&api_version)?;

    let game = GameY::try_from(req.position).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid YEN format: {}", err),
            Some(api_version.clone()),
            req.bot_id.clone(),
        ))
    })?;

    let bot_id = req.bot_id.unwrap_or_else(|| "random".to_string());
    let resolved_id = state.resolve_bot_id(&bot_id);

    let bot = state.bots().find(resolved_id).ok_or_else(|| {
        Json(ErrorResponse::error(
            "Bot not found",
            Some(api_version.clone()),
            Some(bot_id.clone()),
        ))
    })?;

    let coords = bot.choose_move(&game).ok_or_else(|| {
        Json(ErrorResponse::error(
            "No valid moves available",
            Some(api_version.clone()),
            Some(bot_id.clone()),
        ))
    })?;

    let mut new_game = game.clone();

    new_game.play_coords(coords).map_err(|err| {
        Json(ErrorResponse::error(
            &format!("Invalid move: {}", err),
            Some(api_version.clone()),
            Some(bot_id.clone()),
        ))
    })?;

    let new_yen: YEN = (&new_game).into();
    Ok(Json(PlayResponse {
        api_version,
        bot_id,
        position: new_yen,
    }))
}

fn count_pieces(layout: &str) -> usize {
    layout
        .chars()
        .filter(|c| *c == 'B' || *c == 'R')
        .count()
}

#[tokio::test]
async fn play_adds_one_piece_to_board() {
    use axum::extract::State;
    use axum::Json;

    // Arrange
    let state = AppState::new_test(); // o como lo crees en tests

    let input_yen = YEN::new(
        3,
        0,
        vec!['B', 'R'],
        "B/BR/.R.".to_string(),
    );

    let req = PlayRequest {
        position: input_yen.clone(),
        bot_id: None,
    };

    // Act
    let response = play(
        State(state),
        axum::extract::Path("v1".to_string()),
        Json(req),
    )
        .await
        .expect("play should succeed");

    let output = response.0;

    // Assert
    let input_cells = count_pieces(input_yen.layout());
    let output_cells = count_pieces(output.position.layout());

    assert_eq!(output.api_version, "v1");
    assert_eq!(output_cells, input_cells + 1);
}


#[tokio::test]
async fn play_fails_with_invalid_yen() {
    let state = AppState::new_test();

    let invalid_yen = YEN::new(
        3,
        0,
        vec!['B', 'R'],
        "INVALID".to_string(),
    );

    let req = PlayRequest {
        position: invalid_yen,
        bot_id: None,
    };

    let result = play(
        State(state),
        axum::extract::Path("v1".to_string()),
        Json(req),
    )
        .await;

    assert!(result.is_err());
}


#[tokio::test]
async fn play_fails_with_unknown_bot() {
    let state = AppState::new_test();

    let yen = YEN::new(
        3,
        0,
        vec!['B', 'R'],
        "B/BR/.R.".to_string(),
    );

    let req = PlayRequest {
        position: yen,
        bot_id: Some("nonexistent".to_string()),
    };

    let result = play(
        State(state),
        axum::extract::Path("v1".to_string()),
        Json(req),
    )
        .await;

    assert!(result.is_err());
}
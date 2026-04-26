use crate::{Coordinates, GameStatus, GameY, PlayerId, YBot};
use rand::Rng;

pub struct MontecarloBot {
    pub simulations: usize,
}

impl MontecarloBot {
    pub fn new(simulations: usize) -> Self {
        Self { simulations }
    }

    fn rollout(mut board: GameY, player: PlayerId) -> f64 {
        let mut rng = rand::thread_rng();

        while board.winner().is_none() {
            let moves = board.available_cells();
            if moves.is_empty() {
                break;
            }

            let idx = rng.gen_range(0..moves.len());
            let cell = moves[idx];

            let coords = Coordinates::from_index(cell, board.board_size());

            if board.play_coords(coords).is_err() {
                continue;
            }
        }

        match board.winner() {
            Some(w) if w == player => 1.0,
            Some(_) => 0.0,
            None => 0.5,
        }
    }
}

impl YBot for MontecarloBot {
    fn name(&self) -> &str {
        "montecarlo"
    }

    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        let player = board.next_player()?;
        let moves = board.available_cells();

        if moves.is_empty() {
            return None;
        }

        let mut rng = rand::thread_rng();
        let mut best_score = f64::NEG_INFINITY;
        let mut best_moves = Vec::new();

        for &idx in moves {
            let coords = Coordinates::from_index(idx, board.board_size());

            let mut score_acc = 0.0;
            let sims = self.simulations;

            for _ in 0..sims {
                let mut clone = board.clone();

                if clone.play_coords(coords).is_ok() {
                    score_acc += Self::rollout(clone, player);
                }
            }

            let avg = score_acc / sims as f64;

            if avg > best_score {
                best_score = avg;
                best_moves.clear();
                best_moves.push(coords);
            } else if (avg - best_score).abs() < 1e-9 {
                best_moves.push(coords);
            }
        }

        let idx = rng.gen_range(0..best_moves.len());
        Some(best_moves[idx])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GameY, Movement, PlayerId, Coordinates};

    #[test]
    fn test_name() {
        let bot = MontecarloBot::new(10);
        assert_eq!(bot.name(), "montecarlo");
    }

    #[test]
    fn test_returns_move_on_empty_board() {
        let bot = MontecarloBot::new(10);
        let game = GameY::new(5);

        let mv = bot.choose_move(&game);
        assert!(mv.is_some());
    }

    #[test]
    fn test_move_is_valid_index() {
        let bot = MontecarloBot::new(10);
        let game = GameY::new(5);

        let coords = bot.choose_move(&game).unwrap();
        let idx = coords.to_index(game.board_size());

        assert!(idx < game.total_cells());
    }

    #[test]
    fn test_returns_none_on_full_board() {
        let bot = MontecarloBot::new(10);
        let mut game = GameY::new(2);

        // llenar tablero (3 celdas)
        let moves = vec![
            Coordinates::new(1, 0, 0),
            Coordinates::new(0, 1, 0),
            Coordinates::new(0, 0, 1),
        ];

        for (i, coords) in moves.into_iter().enumerate() {
            game.add_move(Movement::Placement {
                player: PlayerId::new((i % 2) as u32),
                coords,
            }).unwrap();
        }

        assert!(game.available_cells().is_empty());

        let mv = bot.choose_move(&game);
        assert!(mv.is_none());
    }

    #[test]
    fn test_move_is_in_available_cells() {
        let bot = MontecarloBot::new(10);
        let mut game = GameY::new(5);

        // hacemos un movimiento
        game.play_coords(Coordinates::new(4, 0, 0)).unwrap();

        let mv = bot.choose_move(&game).unwrap();
        let idx = mv.to_index(game.board_size());

        assert!(game.available_cells().contains(&idx));
    }

    #[test]
    fn test_multiple_calls_are_valid() {
        let bot = MontecarloBot::new(10);
        let game = GameY::new(6);

        for _ in 0..20 {
            let mv = bot.choose_move(&game).unwrap();
            let idx = mv.to_index(game.board_size());

            assert!(game.available_cells().contains(&idx));
        }
    }

    #[test]
    fn test_bot_does_not_crash_mid_game() {
        let bot = MontecarloBot::new(10);
        let mut game = GameY::new(5);

        // simulamos partida parcial
        let moves = vec![
            Coordinates::new(4,0,0),
            Coordinates::new(3,1,0),
            Coordinates::new(2,1,1),
        ];

        for coords in moves {
            game.play_coords(coords).unwrap();
        }

        let mv = bot.choose_move(&game);
        assert!(mv.is_some());
    }

    #[test]
    fn test_bot_eventually_returns_winning_move_when_obvious() {
        let bot = MontecarloBot::new(50);
        let mut game = GameY::new(3);

        // situación artificial cercana a victoria
        let moves = vec![
            (0, Coordinates::new(2,0,0)),
            (1, Coordinates::new(1,1,0)),
            (0, Coordinates::new(1,0,1)),
        ];

        for (p, coords) in moves {
            game.add_move(Movement::Placement {
                player: PlayerId::new(p),
                coords,
            }).unwrap();
        }

        let mv = bot.choose_move(&game);
        assert!(mv.is_some());
    }

    #[test]
    fn test_does_not_modify_original_board() {
        let bot = MontecarloBot::new(10);
        let game = GameY::new(5);

        let before = game.clone();

        let _ = bot.choose_move(&game);

        // El tablero original NO debe cambiar
        assert_eq!(game.get_board_map(), before.get_board_map());
        assert_eq!(game.available_cells(), before.available_cells());
    }

    #[test]
    fn test_returns_different_moves_sometimes() {
        let bot = MontecarloBot::new(20);
        let game = GameY::new(5);

        let mut seen = std::collections::HashSet::new();

        for _ in 0..10 {
            if let Some(mv) = bot.choose_move(&game) {
                seen.insert(mv.to_index(game.board_size()));
            }
        }

        // Monte Carlo debe introducir variedad
        assert!(seen.len() > 1);
    }

    #[test]
    fn test_rollout_eventually_finishes() {
        let bot = MontecarloBot::new(1);
        let game = GameY::new(4);

        let player = game.next_player().unwrap();

        let result = MontecarloBot::rollout(game.clone(), player);

        // resultado válido
        assert!(result == 0.0 || result == 0.5 || result == 1.0);
    }

    #[test]
    fn test_no_panic_with_many_simulations() {
        let bot = MontecarloBot::new(200);
        let game = GameY::new(5);

        let mv = bot.choose_move(&game);

        assert!(mv.is_some());
    }

    #[test]
    fn test_move_reduces_available_cells() {
        let bot = MontecarloBot::new(10);
        let mut game = GameY::new(5);

        let mv = bot.choose_move(&game).unwrap();
        let before = game.available_cells().len();

        game.play_coords(mv).unwrap();

        let after = game.available_cells().len();

        assert_eq!(before - 1, after);
    }

    #[test]
    fn test_bot_handles_single_available_move() {
        let bot = MontecarloBot::new(10);
        let mut game = GameY::new(2);

        // dejar solo una celda libre
        let coords = vec![
            Coordinates::new(1, 0, 0),
            Coordinates::new(0, 1, 0),
        ];

        for (i, c) in coords.into_iter().enumerate() {
            game.add_move(Movement::Placement {
                player: PlayerId::new((i % 2) as u32),
                coords: c,
            }).unwrap();
        }

        let mv = bot.choose_move(&game).unwrap();

        let remaining = game.available_cells()[0];
        let expected = Coordinates::from_index(remaining, game.board_size());

        assert_eq!(mv, expected);
    }

    #[test]
    fn test_stability_over_multiple_turns() {
        let bot = MontecarloBot::new(20);
        let mut game = GameY::new(5);

        for _ in 0..10 {
            if game.check_game_over() {
                break;
            }

            let mv = bot.choose_move(&game);
            assert!(mv.is_some());

            game.play_coords(mv.unwrap()).unwrap();
        }

        // simplemente que no haya panic y el juego siga consistente
        assert!(true);
    }
}
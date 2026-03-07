use crate::{Coordinates, GameY, YBot, PlayerId, Movement};
use crate::bot::heurisitic::Heuristic;

/// A generic Minimax-based bot for the Y game.
///
/// The bot is parameterized over a heuristic `H`.
/// The heuristic must implement `Heuristic` and be `Send + Sync`
/// because `YBot` requires thread safety.

pub struct MinimaxBot<H: Heuristic> {
    /// Heuristic used to evaluate non-terminal board states.
    heuristic: H,

    /// Maximum search depth for the minimax algorithm.
    max_depth: u32,
}

impl<H> MinimaxBot<H>
where
    H: Heuristic,
{
    /// Creates a new MinimaxBot with a given heuristic and depth limit.
    pub fn new(heuristic: H, max_depth: u32) -> Self {
        Self { heuristic, max_depth }
    }

    /// Generates all possible moves for the current board state.
    ///
    /// This converts available cell indices into `Coordinates`
    fn generate_moves(board: &GameY) -> Vec<Coordinates> {
        board.available_cells()
            .iter()
            .map(|idx| Coordinates::from_index(*idx, board.board_size()))
            .collect()
    }

    /// Core minimax recursive algorithm.
    ///
    /// # Parameters
    /// - `board`: current game state
    /// - `player`: the root player (the one we are optimizing for)
    /// - `depth`: current depth in the game tree
    /// - `max_depth`: maximum allowed depth
    ///
    /// Returns an evaluation score from the perspective of `player`.
    fn minimax(
        &self,
        board: &GameY,
        player: PlayerId,
        depth: u32,
        max_depth: u32,
    ) -> i32 {
        // Stop searching if:
        // 1) We reached the depth limit
        // 2) The game is over
        if depth == max_depth || board.check_game_over() {
            return self.evaluate(board, player);
        }

        let moves = Self::generate_moves(board);

        // If there are no moves, evaluate directly.
        if moves.is_empty() {
            return self.evaluate(board, player);
        }

        // Determine whose turn it is.
        let current_player = board.next_player().unwrap();

        // MAX node: if it's the root player's turn
        if current_player == player {
            let mut best_score = i32::MIN;

            for mv in moves {
                // Clone board to simulate move
                let mut new_board = board.clone();

                // Apply move for the current player
                new_board.add_move(Movement::Placement {
                    player: current_player,
                    coords: mv,
                }).unwrap();

                // Recursively evaluate resulting position
                let score = self.minimax(
                    &new_board,
                    player,
                    depth + 1,
                    max_depth,
                );

                // MAX node chooses highest score
                best_score = best_score.max(score);
            }

            best_score
        }
        // MIN node: opponent's turn
        else {
            let mut best_score = i32::MAX;

            for mv in moves {
                let mut new_board = board.clone();

                new_board.add_move(Movement::Placement {
                    player: current_player,
                    coords: mv,
                }).unwrap();

                let score = self.minimax(
                    &new_board,
                    player,
                    depth + 1,
                    max_depth,
                );

                // MIN node chooses lowest score
                best_score = best_score.min(score);
            }

            best_score
        }
    }

    /// Evaluates a board state from the perspective of `player`.
    ///
    /// If the game is already won or lost, we return extreme values.
    /// Otherwise, we delegate to the heuristic.
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        if let Some(winner) = board.winner() {
            return if winner == player {
                // Slightly below MAX to avoid potential overflow
                i32::MAX - 1
            } else {
                i32::MIN + 1
            }
        }

        // Non-terminal position → use heuristic
        self.heuristic.evaluate(board, player)
    }
}

/// Implementation of the YBot trait.
///
/// We explicitly require `H: Send + Sync` because:
/// - YBot requires thread safety
/// - The bot may be shared or moved across threads
impl<H> YBot for MinimaxBot<H>
where
    H: Heuristic + Send + Sync,
{
    fn name(&self) -> &str {
        "minimax_bot"
    }

    /// Chooses the best move using minimax search.
    ///
    /// Iterates over all legal moves, evaluates each resulting position,
    /// and selects the move with the highest score.
    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        let player = board.next_player()?;

        let moves = Self::generate_moves(board);

        let mut best_score = i32::MIN;
        let mut best_move = None;

        for mv in moves {
            let mut new_board = board.clone();

            new_board.add_move(Movement::Placement {
                player,
                coords: mv,
            }).ok()?;

            let score = self.minimax(
                &new_board,
                player,
                1,
                self.max_depth,
            );

            if score > best_score {
                best_score = score;
                best_move = Some(mv);
            }
        }

        best_move
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Coordinates, GameY, PlayerId, Movement, YBot};

    /// Heurística de prueba: devuelve un valor fijo.
    struct FixedHeuristic(i32);
    impl Heuristic for FixedHeuristic {
        fn evaluate(&self, _board: &GameY, _player: PlayerId) -> i32 {
            self.0
        }
    }

    #[test]
    fn test_minimax_bot_name() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 1);
        assert_eq!(bot.name(), "minimax_bot");
    }

    #[test]
    fn test_choose_move_on_empty_board_returns_some() {
        let bot = MinimaxBot::new(FixedHeuristic(1), 1);
        let board = GameY::new(3); // tablero pequeño

        let mv = bot.choose_move(&board);
        assert!(mv.is_some());

        // La coordenada debe estar en las celdas disponibles
        let index = mv.unwrap().to_index(board.board_size());
        assert!(board.available_cells().contains(&index));
    }

    #[test]
    fn test_choose_move_on_full_board_returns_none() {
        let bot = MinimaxBot::new(FixedHeuristic(1), 1);
        let mut board = GameY::new(2); // tablero triangular 2 → 3 celdas

        // llenar el tablero
        for (i, &player_id) in [0, 1, 0].iter().enumerate() {
            let player = PlayerId::new(player_id);
            let coords = Coordinates::from_index(i as u32, board.board_size());
            board.add_move(Movement::Placement { player, coords }).unwrap();
        }

        let mv = bot.choose_move(&board);
        assert!(mv.is_none());
    }

    #[test]
    fn test_minimax_returns_heuristic_score() {
        let bot = MinimaxBot::new(FixedHeuristic(42), 1);
        let board = GameY::new(3);
        let player = board.next_player().unwrap();

        let score = bot.minimax(&board, player, 0, 1);
        // Como profundidad = 1, score = heurística
        assert_eq!(score, 42);
    }

    #[test]
    fn test_minimax_prefers_max_over_min() {
        let bot = MinimaxBot::new(FixedHeuristic(10), 1);
        let board = GameY::new(3);
        let player = board.next_player().unwrap();

        // Ejecutar minimax desde la perspectiva del jugador actual
        let score = bot.minimax(&board, player, 0, 1);
        assert_eq!(score, 10);
    }

    #[test]
    fn test_generate_moves_returns_all_available_cells() {
        let board = GameY::new(3);
        let moves = MinimaxBot::<FixedHeuristic>::generate_moves(&board);

        assert_eq!(moves.len(), board.available_cells().len());
        for mv in moves {
            let idx = mv.to_index(board.board_size());
            assert!(board.available_cells().contains(&idx));
        }
    }

    #[test]
    fn test_minimax_detects_forced_win_depth_2() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 2);
        let board = GameY::new(3);

        // This will be the winning index because, as the heurisitic always returns
        // 0, it will return the first position available
        let winning_index = board.available_cells()[0];
        let winning_coords =
            Coordinates::from_index(winning_index, board.board_size());

        let mv = bot.choose_move(&board).unwrap();

        assert_eq!(mv, winning_coords);
    }


    #[test]
    fn test_minimax_avoids_immediate_loss_depth_2() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 2);
        let mut board = GameY::new(3);

        let p0 = PlayerId::new(0);
        let p1 = PlayerId::new(1);

        // Turn 0
        board.add_move(Movement::Placement {
            player: p0,
            coords: Coordinates::new(1,0,1),
        }).unwrap();

        // Turn 1
        board.add_move(Movement::Placement {
            player: p1,
            coords: Coordinates::new(2,0,0),
        }).unwrap();

        // Turn 0
        board.add_move(Movement::Placement {
            player: p0,
            coords: Coordinates::new(0,1,1),
        }).unwrap();

        // Turn 1
        board.add_move(Movement::Placement {
            player: p1,
            coords: Coordinates::new(1,1,0),
        }).unwrap();

        // Now if Player 0 does NOT block (0,2,0),
        // Player 1 wins next turn.

        let blocking_move = Coordinates::new(0,2,0);

        let chosen_move = bot.choose_move(&board).unwrap();

        assert_eq!(chosen_move, blocking_move);
    }

    use std::sync::{Arc, Mutex};

    struct CountingHeuristic {
        counter: Arc<Mutex<u32>>,
    }

    impl Heuristic for CountingHeuristic {
        fn evaluate(&self, _board: &GameY, _player: PlayerId) -> i32 {
            let mut count = self.counter.lock().unwrap();
            *count += 1;
            0
        }
    }

    #[test]
    fn test_depth_increases_node_count() {
        let counter = Arc::new(Mutex::new(0));
        let heuristic = CountingHeuristic {
            counter: counter.clone(),
        };

        let bot = MinimaxBot::new(heuristic, 3);
        let board = GameY::new(3);

        let player = board.next_player().unwrap();
        bot.minimax(&board, player, 0, 3);

        let calls = *counter.lock().unwrap();

        // As the board is size 3 and max depth is also 3, there can be made 6
        // moves at first, then 5, and finally 4. This gives us 6*5*4 = 120 calls
        assert_eq!(calls, 120);
    }
}
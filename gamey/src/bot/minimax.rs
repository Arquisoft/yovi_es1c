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
            if winner == player {
                // Slightly below MAX to avoid potential overflow
                return i32::MAX - 1;
            } else {
                return i32::MIN + 1;
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
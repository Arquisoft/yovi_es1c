use crate::bot::heurisitic::Heuristic;
use crate::{Coordinates, GameY, Movement, PlayerId, YBot};
use std::sync::atomic::{AtomicU64, Ordering};

const DEFAULT_EXACT_ENDGAME_CELLS: u32 = 8;
const DEFAULT_ADAPTIVE_EXTENSION: u32 = 1;
static VARIETY_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct VarietyConfig {
    max_candidates: usize,
    score_window: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TacticalKind {
    Quiet,
    Winning,
    Blocking,
    DoubleThreat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ScoredMove {
    coords: Coordinates,
    sort_score: i32,
    eval_score: i32,
    tactical: TacticalKind,
}

pub struct MinimaxBot<H: Heuristic> {
    name: String,
    heuristic: H,
    max_depth: u32,
    exact_endgame_cells: u32,
    adaptive_extension: u32,
    variety: Option<VarietyConfig>,
}

impl<H> MinimaxBot<H>
where
    H: Heuristic,
{
    pub fn new(heuristic: H, max_depth: u32) -> Self {
        let name = format!("minimax_{}_d{}", heuristic.name(), max_depth);
        Self {
            name,
            heuristic,
            max_depth,
            exact_endgame_cells: DEFAULT_EXACT_ENDGAME_CELLS,
            adaptive_extension: DEFAULT_ADAPTIVE_EXTENSION,
            variety: None,
        }
    }

    pub fn with_variety(mut self, max_candidates: usize, score_window: i32) -> Self {
        self.variety = Some(VarietyConfig {
            max_candidates: max_candidates.max(2),
            score_window: score_window.max(1),
        });
        self
    }

    fn generate_moves(board: &GameY) -> Vec<Coordinates> {
        board
            .available_cells()
            .iter()
            .map(|idx| Coordinates::from_index(*idx, board.board_size()))
            .collect()
    }

    fn simulate_move(board: &GameY, player: PlayerId, coords: Coordinates) -> Option<GameY> {
        let mut new_board = board.clone();
        new_board
            .add_move(Movement::Placement { player, coords })
            .ok()?;
        Some(new_board)
    }

    fn winning_moves_for(board: &GameY, player: PlayerId) -> Vec<Coordinates> {
        Self::generate_moves(board)
            .into_iter()
            .filter(|coords| {
                Self::simulate_move(board, player, *coords)
                    .map(|candidate| candidate.winner() == Some(player))
                    .unwrap_or(false)
            })
            .collect()
    }

    fn count_sides(set: &crate::core::player_set::PlayerSet) -> i32 {
        (set.touches_side_a as i32) + (set.touches_side_b as i32) + (set.touches_side_c as i32)
    }

    fn count_two_side_sets(board: &GameY, player: PlayerId) -> usize {
        board
            .sets_of_player(player)
            .iter()
            .filter(|set| Self::count_sides(set) >= 2)
            .count()
    }

    fn local_shape_score(board: &GameY, coords: Coordinates, player: PlayerId) -> i32 {
        let mut score = 0;
        board.for_each_neighbor(&coords, |neighbor| match board.cell_at(&neighbor) {
            Some(owner) if owner == player => score += 35,
            Some(_) => score += 12,
            None => score += 6,
        });
        score
    }

    fn center_score(board: &GameY, coords: Coordinates) -> i32 {
        let center = board.board_size() as i32 / 2;
        let dx = coords.x() as i32 - center;
        let dy = coords.y() as i32 - center;
        let dz = coords.z() as i32 - center;
        let dist = dx.abs() + dy.abs() + dz.abs();
        (board.board_size() as i32 * 3 - dist) * 18
    }

    fn light_sort_score(board: &GameY, coords: Coordinates, player: PlayerId) -> i32 {
        let mut pressure_bonus = 0;
        board.for_each_neighbor(&coords, |neighbor| {
            if let Some((set_idx, owner)) = board.get_board_map().get(&neighbor) {
                if *owner != player {
                    let root = board.find_const(*set_idx);
                    if Self::count_sides(&board.get_sets()[root]) >= 2 {
                        pressure_bonus += 220;
                    }
                }
            }
        });

        Self::center_score(board, coords)
            + Self::local_shape_score(board, coords, player)
            + pressure_bonus
    }

    fn score_move(
        &self,
        board: &GameY,
        player: PlayerId,
        coords: Coordinates,
        urgent_blocks: &[Coordinates],
    ) -> Option<ScoredMove> {
        let opponent = GameY::other_player(player);
        let current_opponent_two_side = Self::count_two_side_sets(board, opponent);
        let remaining = board.available_cells().len();
        let new_board = Self::simulate_move(board, player, coords)?;

        if new_board.winner() == Some(player) {
            return Some(ScoredMove {
                coords,
                sort_score: i32::MAX - 8,
                eval_score: i32::MAX - 8,
                tactical: TacticalKind::Winning,
            });
        }

        let eval_score = self.evaluate(&new_board, player);
        let next_opponent_wins = if !urgent_blocks.is_empty() || remaining <= 18 {
            Self::winning_moves_for(&new_board, opponent).len()
        } else {
            0
        };
        let own_follow_up_wins = if remaining <= 12 {
            Self::winning_moves_for(&new_board, player).len()
        } else {
            0
        };
        let opponent_two_side_after = Self::count_two_side_sets(&new_board, opponent);
        let player_two_side_after = Self::count_two_side_sets(&new_board, player);

        let blocks_now = urgent_blocks.contains(&coords)
            || (!urgent_blocks.is_empty() && next_opponent_wins == 0);
        let creates_double_threat = own_follow_up_wins >= 2;

        let tactical = if blocks_now {
            TacticalKind::Blocking
        } else if creates_double_threat {
            TacticalKind::DoubleThreat
        } else {
            TacticalKind::Quiet
        };

        let tactical_bonus = match tactical {
            TacticalKind::Winning => i32::MAX - 8,
            TacticalKind::Blocking => 700_000,
            TacticalKind::DoubleThreat => 180_000,
            TacticalKind::Quiet => 0,
        };

        let two_side_delta =
            (player_two_side_after as i32 * 1_100) - (opponent_two_side_after as i32 * 1_250);
        let suppression_bonus =
            ((current_opponent_two_side as i32 - opponent_two_side_after as i32).max(0)) * 900;

        Some(ScoredMove {
            coords,
            sort_score: tactical_bonus
                + eval_score
                + Self::center_score(board, coords)
                + Self::local_shape_score(board, coords, player)
                + two_side_delta
                + suppression_bonus
                - (next_opponent_wins as i32) * 3_000,
            eval_score,
            tactical,
        })
    }

    fn order_moves(
        &self,
        board: &GameY,
        moves: Vec<Coordinates>,
        player: PlayerId,
    ) -> Vec<ScoredMove> {
        let urgent_blocks = Self::winning_moves_for(board, GameY::other_player(player));
        let use_light_scoring = board.available_cells().len() > 40 && urgent_blocks.is_empty();
        let mut scored_moves: Vec<_> = moves
            .into_iter()
            .filter_map(|mv| {
                if use_light_scoring {
                    let sort_score = Self::light_sort_score(board, mv, player);
                    Some(ScoredMove {
                        coords: mv,
                        sort_score,
                        eval_score: sort_score,
                        tactical: TacticalKind::Quiet,
                    })
                } else {
                    self.score_move(board, player, mv, &urgent_blocks)
                }
            })
            .collect();

        scored_moves.sort_by(|left, right| {
            right
                .sort_score
                .cmp(&left.sort_score)
                .then_with(|| right.eval_score.cmp(&left.eval_score))
        });
        scored_moves
    }

    fn beam_width(
        &self,
        remaining_moves: usize,
        depth: u32,
        exact_search: bool,
        tactical_frontier: bool,
    ) -> usize {
        if exact_search {
            return remaining_moves;
        }
        if remaining_moves <= 8 {
            return remaining_moves;
        }
        if tactical_frontier {
            return remaining_moves.min(18);
        }
        if depth == 0 {
            if remaining_moves > 80 {
                24
            } else if remaining_moves > 40 {
                20
            } else {
                16
            }
        } else if remaining_moves > 80 {
            10
        } else if remaining_moves > 40 {
            8
        } else {
            6
        }
    }

    fn search_depth(&self, board: &GameY, ordered_moves: &[ScoredMove]) -> (u32, bool) {
        let remaining = board.available_cells().len() as u32;
        if remaining <= self.exact_endgame_cells {
            return (remaining, true);
        }

        let tactical = ordered_moves.iter().any(|mv| {
            mv.tactical == TacticalKind::Blocking || mv.tactical == TacticalKind::DoubleThreat
        });
        if tactical || remaining <= 14 {
            (self.max_depth + self.adaptive_extension, false)
        } else {
            (self.max_depth, false)
        }
    }

    fn minimax(
        &self,
        board: &GameY,
        player: PlayerId,
        depth: u32,
        max_depth: u32,
        mut alpha: i32,
        mut beta: i32,
        exact_search: bool,
    ) -> i32 {
        if depth == max_depth || board.check_game_over() {
            return self.evaluate(board, player);
        }

        let current_player = board.next_player().unwrap();
        let scored_moves = self.order_moves(board, Self::generate_moves(board), current_player);
        if scored_moves.is_empty() {
            return self.evaluate(board, player);
        }

        let tactical_frontier = scored_moves
            .iter()
            .any(|mv| mv.tactical != TacticalKind::Quiet);
        let limit = self.beam_width(scored_moves.len(), depth, exact_search, tactical_frontier);
        let frontier: Vec<_> = scored_moves.into_iter().take(limit).collect();

        if current_player == player {
            let mut value = i32::MIN;
            for mv in frontier {
                let mut new_board = board.clone();
                new_board
                    .add_move(Movement::Placement {
                        player: current_player,
                        coords: mv.coords,
                    })
                    .unwrap();

                let score = self.minimax(
                    &new_board,
                    player,
                    depth + 1,
                    max_depth,
                    alpha,
                    beta,
                    exact_search,
                );
                value = value.max(score);
                alpha = alpha.max(value);
                if beta <= alpha {
                    break;
                }
            }
            value
        } else {
            let mut value = i32::MAX;
            for mv in frontier {
                let mut new_board = board.clone();
                new_board
                    .add_move(Movement::Placement {
                        player: current_player,
                        coords: mv.coords,
                    })
                    .unwrap();

                let score = self.minimax(
                    &new_board,
                    player,
                    depth + 1,
                    max_depth,
                    alpha,
                    beta,
                    exact_search,
                );
                value = value.min(score);
                beta = beta.min(value);
                if beta <= alpha {
                    break;
                }
            }
            value
        }
    }

    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        if let Some(winner) = board.winner() {
            return if winner == player {
                i32::MAX - 1
            } else {
                i32::MIN + 1
            };
        }

        self.heuristic.evaluate(board, player)
    }

    fn choose_varied_move(
        &self,
        scored_moves: &[(Coordinates, i32)],
        force_opening_variety: bool,
    ) -> Option<Coordinates> {
        let config = self.variety?;
        if scored_moves.len() <= 1 {
            return scored_moves.first().map(|(coords, _)| *coords);
        }

        let best_score = scored_moves[0].1;
        let eligible: Vec<_> = if force_opening_variety {
            scored_moves.iter().take(config.max_candidates).collect()
        } else {
            scored_moves
                .iter()
                .take(config.max_candidates)
                .filter(|(_, score)| best_score - *score <= config.score_window)
                .collect()
        };

        if eligible.len() <= 1 {
            return eligible.first().map(|entry| entry.0);
        }

        if force_opening_variety {
            let index = (VARIETY_COUNTER.fetch_add(1, Ordering::Relaxed) as usize) % eligible.len();
            return Some(eligible[index].0);
        }

        let total_weight: i32 = eligible
            .iter()
            .map(|(_, score)| (config.score_window - (best_score - *score) + 1).max(1))
            .sum();
        let slot = (VARIETY_COUNTER.fetch_add(1, Ordering::Relaxed) % total_weight as u64) as i32;

        let mut cursor = 0;
        for (coords, score) in eligible {
            cursor += (config.score_window - (best_score - *score) + 1).max(1);
            if slot < cursor {
                return Some(*coords);
            }
        }

        scored_moves.first().map(|(coords, _)| *coords)
    }
}

impl<H> YBot for MinimaxBot<H>
where
    H: Heuristic + Send + Sync,
{
    fn name(&self) -> &str {
        &self.name
    }

    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        let player = board.next_player()?;
        let moves = Self::generate_moves(board);
        if moves.is_empty() {
            return None;
        }
        if moves.len() == 1 {
            return Some(moves[0]);
        }

        let immediate_wins = Self::winning_moves_for(board, player);
        if let Some(winning_move) = immediate_wins.first() {
            return Some(*winning_move);
        }

        let urgent_blocks = Self::winning_moves_for(board, GameY::other_player(player));
        if !urgent_blocks.is_empty() {
            let mut best_block = None;
            let mut best_block_score = i32::MIN;

            for mv in urgent_blocks {
                let Some(new_board) = Self::simulate_move(board, player, mv) else {
                    continue;
                };
                let block_score = self.evaluate(&new_board, player);
                if block_score > best_block_score {
                    best_block_score = block_score;
                    best_block = Some(mv);
                }
            }

            if best_block.is_some() {
                return best_block;
            }
        }

        let ordered = self.order_moves(board, moves, player);
        let (search_depth, exact_search) = self.search_depth(board, &ordered);
        let tactical_frontier = ordered.iter().any(|mv| mv.tactical != TacticalKind::Quiet);
        let beam = self.beam_width(ordered.len(), 0, exact_search, tactical_frontier);
        let frontier: Vec<_> = ordered.into_iter().take(beam).collect();

        let mut scored_choices = Vec::new();
        for candidate in frontier {
            let mut new_board = board.clone();
            new_board
                .add_move(Movement::Placement {
                    player,
                    coords: candidate.coords,
                })
                .ok()?;

            let score = self.minimax(
                &new_board,
                player,
                1,
                search_depth,
                i32::MIN,
                i32::MAX,
                exact_search,
            );

            scored_choices.push((candidate.coords, score, candidate.tactical));
        }

        scored_choices.sort_by(|left, right| right.1.cmp(&left.1));
        let best = scored_choices.first().copied()?;
        if best.2 == TacticalKind::Quiet {
            let scored: Vec<_> = scored_choices
                .iter()
                .map(|(coords, score, _)| (*coords, *score))
                .collect();
            let opening_phase = board.available_cells().len() + 2 >= board.total_cells() as usize;
            if let Some(varied) = self.choose_varied_move(&scored, opening_phase) {
                return Some(varied);
            }
        }

        Some(best.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Coordinates, GameY, Movement, PlayerId, YBot};

    struct FixedHeuristic(i32);

    impl Heuristic for FixedHeuristic {
        fn evaluate(&self, _board: &GameY, _player: PlayerId) -> i32 {
            self.0
        }

        fn name(&self) -> &str {
            "fixed"
        }
    }

    #[test]
    fn test_minimax_bot_name() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 1);
        assert_eq!(bot.name(), "minimax_fixed_d1");
    }

    #[test]
    fn test_choose_move_on_empty_board_returns_some() {
        let bot = MinimaxBot::new(FixedHeuristic(1), 1);
        let board = GameY::new(3);

        let mv = bot.choose_move(&board);
        assert!(mv.is_some());

        let index = mv.unwrap().to_index(board.board_size());
        assert!(board.available_cells().contains(&index));
    }

    #[test]
    fn test_choose_move_on_full_board_returns_none() {
        let bot = MinimaxBot::new(FixedHeuristic(1), 1);
        let mut board = GameY::new(2);

        for (i, &player_id) in [0, 1, 0].iter().enumerate() {
            let player = PlayerId::new(player_id);
            let coords = Coordinates::from_index(i as u32, board.board_size());
            board
                .add_move(Movement::Placement { player, coords })
                .unwrap();
        }

        let mv = bot.choose_move(&board);
        assert!(mv.is_none());
    }

    #[test]
    fn test_minimax_returns_heuristic_score() {
        let bot = MinimaxBot::new(FixedHeuristic(42), 1);
        let board = GameY::new(3);
        let player = board.next_player().unwrap();

        let score = bot.minimax(&board, player, 0, 1, i32::MIN, i32::MAX, false);
        assert_eq!(score, 42);
    }

    #[test]
    fn test_minimax_prefers_max_over_min() {
        let bot = MinimaxBot::new(FixedHeuristic(10), 1);
        let board = GameY::new(3);
        let player = board.next_player().unwrap();

        let score = bot.minimax(&board, player, 0, 1, i32::MIN, i32::MAX, false);
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

        let mv = bot.choose_move(&board).unwrap();

        assert_eq!(mv, Coordinates::new(0, 2, 0));
    }

    #[test]
    fn test_minimax_avoids_immediate_loss_depth_2() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 2);
        let mut board = GameY::new(3);

        let p0 = PlayerId::new(0);
        let p1 = PlayerId::new(1);

        board
            .add_move(Movement::Placement {
                player: p0,
                coords: Coordinates::new(1, 0, 1),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: p1,
                coords: Coordinates::new(2, 0, 0),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: p0,
                coords: Coordinates::new(0, 1, 1),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: p1,
                coords: Coordinates::new(1, 1, 0),
            })
            .unwrap();

        let blocking_move = Coordinates::new(0, 2, 0);
        let chosen_move = bot.choose_move(&board).unwrap();

        assert_eq!(chosen_move, blocking_move);
    }

    #[test]
    fn test_variety_rotates_between_close_candidates() {
        let bot = MinimaxBot::new(FixedHeuristic(0), 1).with_variety(3, 100);
        let board = GameY::new(5);
        let a = bot.choose_move(&board).unwrap();
        let b = bot.choose_move(&board).unwrap();

        assert_ne!(a, b);
    }
}

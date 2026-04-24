use crate::bot::heurisitic::Heuristic;
use crate::core::player_set::PlayerSet;
use crate::{GameY, PlayerId};

pub struct SetConnectivityHeuristic;

impl Heuristic for SetConnectivityHeuristic {
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        Self::evaluate_player(board, player)
            - Self::evaluate_player(board, GameY::other_player(player))
    }

    fn name(&self) -> &str {
        "connectivity"
    }
}

impl SetConnectivityHeuristic {
    fn evaluate_player(board: &GameY, player: PlayerId) -> i32 {
        let mut score = 0;
        let mut unique_sets = Self::unique_roots(board, player);

        unique_sets.sort_by_key(|s| -(s.size as i32));
        let unique_sets = unique_sets.into_iter().take(12).collect::<Vec<_>>();

        for set in &unique_sets {
            let sides = (set.touches_side_a as i32)
                + (set.touches_side_b as i32)
                + (set.touches_side_c as i32);

            if sides == 3 {
                score += 100_000;
            }

            score += Self::local_proximity_score(board, player, set);
            score += Self::center_bonus(board, set);
            score += Self::block_opponent_score(board, player);
        }

        score -= (unique_sets.len() as i32) * 15;
        score
    }

    fn center_bonus(board: &GameY, set: &PlayerSet) -> i32 {
        let center = board.board_size() as i32 / 2;
        let max_dist = board.board_size() as i32 * 2;

        let mut score = 0;
        for cell in &set.cells {
            let dx = cell.x() as i32 - center;
            let dy = cell.y() as i32 - center;
            let dz = cell.z() as i32 - center;
            let dist = dx.abs() + dy.abs() + dz.abs();
            score += (max_dist - dist) * 100;
        }

        score
    }

    fn unique_roots(board: &GameY, player: PlayerId) -> Vec<&PlayerSet> {
        let mut roots = std::collections::HashSet::new();
        let mut result = Vec::new();

        for (_, (set_idx, owner)) in board.get_board_map() {
            if *owner == player {
                let root = board.find_const(*set_idx);
                if roots.insert(root) {
                    result.push(&board.get_sets()[root]);
                }
            }
        }

        result
    }

    fn local_proximity_score(board: &GameY, player: PlayerId, set: &PlayerSet) -> i32 {
        let mut score = 0;

        for cell in &set.cells {
            board.for_each_neighbor(cell, |neighbor| {
                match board.get_board_map().get(&neighbor) {
                    Some((_, owner)) if *owner == player => score += 3,
                    None => score += 1,
                    _ => {}
                }
            });
        }

        score
    }

    fn block_opponent_score(board: &GameY, player: PlayerId) -> i32 {
        let opponent = GameY::other_player(player);

        board
            .get_sets()
            .iter()
            .filter(|set| Self::is_opponent_set(board, set, opponent))
            .map(|set| Self::opponent_set_pressure(board, set))
            .sum()
    }

    fn opponent_set_pressure(board: &GameY, set: &PlayerSet) -> i32 {
        let mut score = 0;

        for cell in &set.cells {
            board.for_each_neighbor(cell, |neighbor| {
                if !board.get_board_map().contains_key(&neighbor) {
                    score += (set.size as i32) * 50;

                    let sides_touched = (set.touches_side_a as i32)
                        + (set.touches_side_b as i32)
                        + (set.touches_side_c as i32);
                    score += sides_touched * 100;
                }
            });
        }

        score
    }

    fn is_opponent_set(board: &GameY, set: &PlayerSet, opponent: PlayerId) -> bool {
        if set.cells.is_empty() {
            return false;
        }

        let first_cell = set.cells[0];
        match board.get_board_map().get(&first_cell) {
            Some((_, owner)) => *owner == opponent,
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Coordinates, GameY, Movement, PlayerId};

    fn place(game: &mut GameY, player: PlayerId, x: u32, y: u32, z: u32) {
        let coords = Coordinates::new(x, y, z);
        game.add_move(Movement::Placement { player, coords })
            .unwrap();
    }

    #[test]
    fn heuristic_returns_a_value() {
        let game = GameY::new(5);
        let heuristic = SetConnectivityHeuristic;

        let score = heuristic.evaluate(&game, PlayerId::new(0));
        let _: i32 = score;
    }

    #[test]
    fn heuristic_is_antisymmetric() {
        let mut game = GameY::new(5);
        let heuristic = SetConnectivityHeuristic;

        place(&mut game, PlayerId::new(0), 4, 0, 0);
        place(&mut game, PlayerId::new(1), 0, 4, 0);

        let score_p0 = heuristic.evaluate(&game, PlayerId::new(0));
        let score_p1 = heuristic.evaluate(&game, PlayerId::new(1));

        assert_eq!(score_p0, -score_p1);
    }
}

use crate::bot::heurisitic::Heuristic;
use crate::core::player_set::PlayerSet;
use crate::{Coordinates, GameY, PlayerId};
use std::collections::{HashMap, HashSet};

pub struct BalancedHeuristic;

impl Heuristic for BalancedHeuristic {
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        Self::evaluate_player(board, player)
            - Self::evaluate_player(board, GameY::other_player(player))
    }

    fn name(&self) -> &str {
        "balanced"
    }
}

impl BalancedHeuristic {
    fn evaluate_player(board: &GameY, player: PlayerId) -> i32 {
        let sets = board.sets_of_player(player);
        if sets.is_empty() {
            return 0;
        }

        let mut score = 0;
        for set in &sets {
            let side_count = Self::side_count(set);
            let size = set.size as i32;

            score += match side_count {
                3 => 200_000,
                2 => 4_500 + size * 140,
                1 => 700 + size * 85,
                _ => size * 50,
            };

            score += Self::third_side_progress(board, set);
            score += Self::bridge_potential(board, player, set);
            score += Self::center_bonus(board, set);
        }

        score -= (sets.len().saturating_sub(1) as i32) * 180;
        score -= Self::opponent_two_side_pressure(board, GameY::other_player(player));
        score
    }

    fn side_count(set: &PlayerSet) -> i32 {
        (set.touches_side_a as i32) + (set.touches_side_b as i32) + (set.touches_side_c as i32)
    }

    fn third_side_progress(board: &GameY, set: &PlayerSet) -> i32 {
        let distance = Self::missing_side_distance(set).unwrap_or(0);
        let urgency = if board.available_cells().len() <= 10 {
            180
        } else {
            120
        };
        let mut score = -(distance * urgency);

        if Self::side_count(set) == 2 {
            score += 1_200;
            if distance <= 1 {
                score += 900;
            }
        }

        score
    }

    fn missing_side_distance(set: &PlayerSet) -> Option<i32> {
        let mut best = None;
        for cell in &set.cells {
            if !set.touches_side_a {
                best =
                    Some(best.map_or(cell.x() as i32, |current: i32| current.min(cell.x() as i32)));
            }
            if !set.touches_side_b {
                best =
                    Some(best.map_or(cell.y() as i32, |current: i32| current.min(cell.y() as i32)));
            }
            if !set.touches_side_c {
                best =
                    Some(best.map_or(cell.z() as i32, |current: i32| current.min(cell.z() as i32)));
            }
        }
        best
    }

    fn bridge_potential(board: &GameY, player: PlayerId, set: &PlayerSet) -> i32 {
        let mut frontier_touch_count: HashMap<Coordinates, u8> = HashMap::new();
        let mut friendly_contacts = 0;
        let mut hostile_contacts = 0;

        for cell in &set.cells {
            board.for_each_neighbor(cell, |neighbor| match board.cell_at(&neighbor) {
                Some(owner) if owner == player => friendly_contacts += 1,
                Some(_) => hostile_contacts += 1,
                None => {
                    *frontier_touch_count.entry(neighbor).or_insert(0) += 1;
                }
            });
        }

        let shared_frontier = frontier_touch_count
            .values()
            .filter(|touches| **touches >= 2)
            .count() as i32;

        frontier_touch_count.len() as i32 * 35 + shared_frontier * 120 + friendly_contacts * 8
            - hostile_contacts * 4
    }

    fn center_bonus(board: &GameY, set: &PlayerSet) -> i32 {
        let center = board.board_size() as i32 / 2;
        let phase_scale = if board.available_cells().len() > 20 {
            16
        } else {
            10
        };

        set.cells
            .iter()
            .map(|cell| {
                let dx = cell.x() as i32 - center;
                let dy = cell.y() as i32 - center;
                let dz = cell.z() as i32 - center;
                let dist = dx.abs() + dy.abs() + dz.abs();
                ((board.board_size() as i32 * 2) - dist) * phase_scale
            })
            .sum()
    }

    fn opponent_two_side_pressure(board: &GameY, opponent: PlayerId) -> i32 {
        let mut pressure = 0;
        for set in board.sets_of_player(opponent) {
            if Self::side_count(set) != 2 {
                continue;
            }

            let mut escapes = HashSet::new();
            for cell in &set.cells {
                board.for_each_neighbor(cell, |neighbor| {
                    if board.cell_at(&neighbor).is_none() {
                        escapes.insert(neighbor);
                    }
                });
            }

            let distance = Self::missing_side_distance(set).unwrap_or(0);
            pressure += 1_200;
            pressure += ((board.board_size() as i32) - distance).max(0) * 140;
            pressure += (12 - escapes.len().min(12) as i32) * 90;
        }

        pressure
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Coordinates, GameY, Movement};

    #[test]
    fn balanced_heuristic_rewards_two_side_connections() {
        let heuristic = BalancedHeuristic;
        let mut board = GameY::new(5);
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 0, 4),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(4, 0, 0),
            })
            .unwrap();
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 3),
            })
            .unwrap();

        let score = heuristic.evaluate(&board, PlayerId::new(0));
        let opponent_score = heuristic.evaluate(&board, PlayerId::new(1));

        assert!(score > opponent_score);
    }
}

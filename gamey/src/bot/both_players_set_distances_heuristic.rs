use crate::{GameY, PlayerId};
use crate::bot::heurisitic::Heuristic;
use std::collections::HashSet;

pub struct BotPlayersSetDistancesHeuristic;

impl Heuristic for BotPlayersSetDistancesHeuristic {
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        Self::evaluate_player(board, player) -
            Self::evaluate_player(board, GameY::other_player(player))
    }

    fn name(&self) -> &str {
        "opposing_set"
    }
}

impl BotPlayersSetDistancesHeuristic {
    /// Gets the sets of pieces of the specified player. Iterates over them, and maps
    /// the touched sides and the size of each set. It gives a numerical value to each
    /// set, valuing the number touched sides more than the set's size. Finally, sums
    /// all sets individual values
    fn evaluate_player(board: &GameY, player: PlayerId) -> i32 {
        let sets = board.sets_of_player(player);
        let mut seen = std::collections::HashSet::new();
        let mut score = 0;

        // Score base por set
        let unique_sets: Vec<_> = sets.iter()
            .filter(|s| seen.insert(s.parent))
            .collect();

        for s in &unique_sets {
            let sides = (s.touches_side_a as i32) +
                (s.touches_side_b as i32) +
                (s.touches_side_c as i32);
            let size = s.size as i32;

            score += match sides {
                0 => size,
                1 => 20 + size * 2,
                2 => 500 + size * 3,
                3 => 100_000,
                _ => 0
            };
        }

        // Bonus por proximidad de sets
        for i in 0..unique_sets.len() {
            for j in i+1..unique_sets.len() {
                let dist = unique_sets[i].min_distance_to(unique_sets[j]);
                if dist > 0 {
                    score += 1000 / (dist as i32); // ajusta el multiplicador a tu gusto
                }
            }
        }

        score
    }
}
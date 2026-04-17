use crate::{GameY, PlayerId};
use crate::bot::heurisitic::Heuristic;

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
            for j in i + 1..unique_sets.len() {
                let dist = unique_sets[i].min_distance_to(unique_sets[j]);
                if dist > 0 {
                    score += 1000 / (dist as i32); // ajusta el multiplicador a tu gusto
                }
            }
        }

        score
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{GameY, PlayerId, Coordinates, Movement};

    fn place(game: &mut GameY, player: PlayerId, x: u32, y: u32, z: u32) {
        let coords = Coordinates::new(x, y, z);
        game.add_move(Movement::Placement { player, coords }).unwrap();
    }

    #[test]
    fn evaluate_returns_value_on_empty_board() {
        let game = GameY::new(5);
        let heuristic = BotPlayersSetDistancesHeuristic;

        let score = heuristic.evaluate(&game, PlayerId::new(0));

        // Solo comprobamos que devuelve un i32 y no hace panic
        let _: i32 = score;
    }

    #[test]
    fn evaluate_returns_value_with_one_piece() {
        let mut game = GameY::new(5);
        let heuristic = BotPlayersSetDistancesHeuristic;

        place(&mut game, PlayerId::new(0), 4, 0, 0);

        let score = heuristic.evaluate(&game, PlayerId::new(0));

        let _: i32 = score;
    }

    #[test]
    fn evaluate_returns_value_with_multiple_sets() {
        let mut game = GameY::new(5);
        let heuristic = BotPlayersSetDistancesHeuristic;

        // Dos sets separados del mismo jugador
        place(&mut game, PlayerId::new(0), 4, 0, 0);
        place(&mut game, PlayerId::new(0), 0, 4, 0);

        let score = heuristic.evaluate(&game, PlayerId::new(0));

        let _: i32 = score;
    }

    #[test]
    fn evaluate_returns_value_with_both_players() {
        let mut game = GameY::new(5);
        let heuristic = BotPlayersSetDistancesHeuristic;

        place(&mut game, PlayerId::new(0), 4, 0, 0);
        place(&mut game, PlayerId::new(1), 0, 4, 0);

        let score = heuristic.evaluate(&game, PlayerId::new(0));

        let _: i32 = score;
    }
}
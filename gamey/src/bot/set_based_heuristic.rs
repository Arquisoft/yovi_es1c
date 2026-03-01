use crate::{GameY, PlayerId};
use crate::bot::heurisitic::Heuristic;

pub struct SetBasedHeuristic;

impl Heuristic for SetBasedHeuristic {
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        /// We get all the player sets
        let player_sets = board.sets_of_player(player);

        /// We get the best set according to the heuristic logic
        let best_set = player_sets
            .iter()
            .map(|s| {
                let sides = (s.touches_side_a as i32)
                    + (s.touches_side_b as i32)
                    + (s.touches_side_c as i32);
                (sides, s.size)
            })
            .max_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)))
            .unwrap_or((0, 0));

        let (sides, size) = best_set;

        let (sides, size) = best_set;
        sides * 10 + size as i32
    }
}
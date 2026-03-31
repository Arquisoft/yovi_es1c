use crate::{GameY, PlayerId};
use crate::bot::heurisitic::Heuristic;
use crate::core::player_set::PlayerSet;

pub struct SetConnectivityHeuristic;

impl Heuristic for SetConnectivityHeuristic {
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32 {
        Self::evaluate_player(board, player) -
            Self::evaluate_player(board, GameY::other_player(player))
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

        for s in &unique_sets {
            let sides = (s.touches_side_a as i32)
                + (s.touches_side_b as i32)
                + (s.touches_side_c as i32);

            let size = s.size as i32;

            // Se tiene en cuenta la cantidad de lados que toca el set, además del tamaño
            // del set. No es lo mismo tocar 2 lados con una sola ficha que con un set grande
            score += match sides {
                3 => 100_000,
                _ => 0
            };

            // proximidad local
            score += Self::local_proximity_score(board, player, s);

            // bonus por centricidad
            score += Self::center_bonus(board, s);

            // bonus por bloquear al oponente
            score += Self::block_opponent_score(board, player, s);
        }

        // penalización global
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

            // Nuevo: mayor peso a celdas centrales
            score += ((max_dist - dist) * 100) as i32;
        }

        score
    }

    fn unique_roots(board: &GameY, player: PlayerId) -> Vec<&PlayerSet> {
        let mut roots = std::collections::HashSet::new();
        let mut result = Vec::new();

        for (_, (set_idx, p)) in board.get_board_map() {
            if *p == player {
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
            for n in board.get_neighbors(cell) {
                match board.get_board_map().get(&n) {
                    Some((_, p)) if *p == player => score += 3,
                    None => score += 1,
                    _ => {}
                }
            }
        }

        score
    }

    /// Bonus por bloquear al oponente
    fn block_opponent_score(board: &GameY, player: PlayerId, _set: &PlayerSet) -> i32 {
        let mut score = 0;
        let opponent = GameY::other_player(player);

        for opp_set in board.get_sets().iter() {
            // Verifica si el set pertenece al oponente
            if opp_set.cells.is_empty() {
                continue;
            }
            let first_cell = opp_set.cells[0];
            if let Some((_, p)) = board.get_board_map().get(&first_cell) {
                if *p != opponent {
                    continue;
                }
            } else {
                continue;
            }

            // Encuentra la frontera vacía alrededor del set → posibles expansiones
            for cell in &opp_set.cells {
                for neighbor in board.get_neighbors(cell) {
                    if !board.get_board_map().contains_key(&neighbor) {
                        // Penaliza por el potencial de expansión del oponente
                        score += (opp_set.size as i32) * 50;

                        let sides_touched = (opp_set.touches_side_a as i32)
                            + (opp_set.touches_side_b as i32)
                            + (opp_set.touches_side_c as i32);
                        score += sides_touched * 100;
                    }
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

    fn setup_empty_board(size: u32) -> GameY {
        GameY::new(size)
    }

    fn place(game: &mut GameY, player: PlayerId, x: u32, y: u32, z: u32) {
        let coords = Coordinates::new(x, y, z);
        game.add_move(Movement::Placement { player, coords }).unwrap();
    }

    #[test]
    fn heuristic_returns_a_value() {
        let game = GameY::new(5);
        let heuristic = SetConnectivityHeuristic;

        let score = heuristic.evaluate(&game, PlayerId::new(0));

        // Simplemente comprobamos que devuelve un valor (no panic)
        let _: i32 = score;
    }

    #[test]
    fn heuristic_is_antisymmetric() {
        let mut game = GameY::new(5);
        let h = SetConnectivityHeuristic;

        place(&mut game, PlayerId::new(0), 4, 0, 0);
        place(&mut game, PlayerId::new(1), 0, 4, 0);

        let score_p0 = h.evaluate(&game, PlayerId::new(0));
        let score_p1 = h.evaluate(&game, PlayerId::new(1));

        assert_eq!(score_p0, -score_p1);
    }
}
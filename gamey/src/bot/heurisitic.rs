use crate::{GameY, PlayerId};

pub trait Heuristic {
    /// Evalúa un tablero desde la perspectiva del jugador `player`.
    fn evaluate(&self, board: &GameY, player: PlayerId) -> i32;
}
use crate::Coordinates;
use crate::core::SetIdx;

// Struct to track connected components in the Union-Find structure
#[derive(Clone, Debug)]
pub(crate) struct PlayerSet {
    pub parent: SetIdx,
    // We track which sides this specific set of pieces is touching
    pub touches_side_a: bool,
    pub touches_side_b: bool,
    pub touches_side_c: bool,
    // Number of pieces in the set
    pub size: usize,
    // All pieces of the set
    pub cells: Vec<Coordinates>,
}

impl PlayerSet {
    /// Checks if this set connects all three sides of the board.
    pub fn is_winning_configuration(&self) -> bool {
        self.touches_side_a && self.touches_side_b && self.touches_side_c
    }

    /// Devuelve la distancia mínima (Manhattan) entre este set y otro set.
    pub fn min_distance_to(&self, other: &PlayerSet) -> u32 {
        let mut min_dist = u32::MAX;
        for &c1 in &self.cells {
            for &c2 in &other.cells {
                let d = c1.manhattan_distance(&c2);
                if d < min_dist {
                    min_dist = d;
                }
            }
        }
        min_dist
    }
}

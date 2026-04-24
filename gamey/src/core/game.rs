use crate::core::SetIdx;
use crate::core::player_set::PlayerSet;
use crate::core::rules::GameRules;
use crate::{Coordinates, GameAction, GameYError, Movement, PlayerId, RenderOptions, YEN};
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use std::path::Path;

/// A Result type alias for game operations that may fail with a `GameYError`.
pub type Result<T> = std::result::Result<T, crate::GameYError>;

/// The main game state for a Y game.
///
/// Y is a connection game played on a triangular board where players
/// take turns placing pieces. The goal is to connect all three sides
/// of the triangle with a single chain of connected pieces.
#[derive(Debug, Clone)]
pub struct GameY {
    // Size of the board (length of one side of the triangular board).
    board_size: u32,

    // Mapping from coordinates to identifiers of players who placed stones there.
    board_map: HashMap<Coordinates, (SetIdx, PlayerId)>,

    status: GameStatus,

    // History of moves made in the game.
    history: Vec<Movement>,

    // Union-Find data structure to track connected components for each player
    sets: Vec<PlayerSet>,

    available_cells: Vec<u32>,
    available_lookup: Vec<usize>,
    blocked_cells: HashSet<Coordinates>,
    rules: GameRules,
}

/// Represents the state of a single cell on the board.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    /// The cell has no piece.
    Empty,
    /// The cell is occupied by a piece belonging to the specified player.
    Occupied(PlayerId),
}

impl GameY {
    /// Creates a new game with the specified board size and number of players.
    pub fn new(board_size: u32) -> Self {
        Self::with_rules(board_size, GameRules::classic())
            .expect("classic rules should always be valid")
    }

    pub fn with_rules(board_size: u32, rules: GameRules) -> Result<Self> {
        let total_cells = (board_size * (board_size + 1)) / 2;
        let mut game = Self {
            board_size,
            board_map: HashMap::new(),
            history: Vec::new(),
            sets: Vec::new(),
            status: GameStatus::Ongoing {
                next_player: PlayerId::new(0),
            },
            available_cells: (0..total_cells).collect(),
            available_lookup: (0..total_cells as usize).collect(),
            blocked_cells: HashSet::new(),
            rules,
        };
        game.apply_honey_blocked_cells()?;
        Ok(game)
    }

    pub fn get_board_map(&self) -> &HashMap<Coordinates, (SetIdx, PlayerId)> {
        &self.board_map
    }

    pub(crate) fn get_sets(&self) -> &Vec<PlayerSet> {
        &self.sets
    }

    pub fn find_const(&self, mut i: SetIdx) -> SetIdx {
        while self.sets[i].parent != i {
            i = self.sets[i].parent;
        }
        i
    }

    /// Returns the current game status.
    pub fn status(&self) -> &GameStatus {
        &self.status
    }

    /// Returns the winner of the game, in case there is one
    pub fn winner(&self) -> Option<PlayerId> {
        match self.status {
            GameStatus::Ongoing { .. } => None,
            GameStatus::Finished { winner } => Some(winner),
        }
    }

    /// Returns true if the game has ended (has a winner).
    pub fn check_game_over(&self) -> bool {
        match self.status {
            GameStatus::Ongoing { .. } => false,
            GameStatus::Finished { winner: _ } => true,
        }
    }

    /// Returns the list of available cell indices where pieces can be placed.
    pub fn available_cells(&self) -> &Vec<u32> {
        &self.available_cells
    }

    pub fn rules(&self) -> &GameRules {
        &self.rules
    }

    /// Returns the total number of cells on the board.
    pub fn total_cells(&self) -> u32 {
        (self.board_size * (self.board_size + 1)) / 2
    }

    /// Checks if the movement is made by the correct player.
    ///
    /// Returns an error if it's not the specified player's turn.
    pub fn check_player_turn(&self, movement: &Movement) -> Result<()> {
        if let GameStatus::Ongoing { next_player } = self.status {
            let player = match movement {
                Movement::Placement { player, .. } => *player,
                Movement::Action { player, .. } => *player,
            };
            if player != next_player {
                return Err(GameYError::InvalidPlayerTurn {
                    expected: next_player,
                    found: player,
                });
            }
        }
        Ok(())
    }

    /// Returns the player who should make the next move, or None if the game is over.
    pub fn next_player(&self) -> Option<PlayerId> {
        if let GameStatus::Ongoing { next_player } = self.status {
            Some(next_player)
        } else {
            None
        }
    }

    /// Returns the opposing player to the one who should make the next move, or None if the game is over.
    pub fn opponent_player(&self) -> Option<PlayerId> {
        if let GameStatus::Ongoing { next_player } = self.status {
            Some(GameY::other_player(next_player))
        } else {
            None
        }
    }

    /// Returns all the set indexes of an specific player
    pub(crate) fn sets_of_player(&self, player: PlayerId) -> Vec<&PlayerSet> {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for (_, (set_idx, p)) in &self.board_map {
            if *p == player {
                let root = self.find_const(*set_idx);
                if seen.insert(root) {
                    result.push(&self.sets[root]);
                }
            }
        }
        result
    }

    /// Loads a game state from a YEN format file.
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let filename = path.as_ref().display().to_string();
        let file_content = std::fs::read_to_string(path).map_err(|e| GameYError::IoError {
            message: format!("Failed to read file: {}", filename),
            error: e.to_string(),
        })?;
        let yen: YEN =
            serde_json::from_str(&file_content).map_err(|e| GameYError::SerdeError { error: e })?;
        GameY::try_from(yen)
    }

    /// Saves the game state to a file in YEN format.
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let yen: YEN = self.into();
        let json_content =
            serde_json::to_string_pretty(&yen).map_err(|e| GameYError::SerdeError { error: e })?;
        let filename = path.as_ref().display().to_string();
        std::fs::write(path, json_content).map_err(|e| GameYError::IoError {
            message: format!("Failed to write file: {}", filename),
            error: e.to_string(),
        })?;
        Ok(())
    }

    /// Adds a move to the game.
    pub fn add_move(&mut self, movement: Movement) -> Result<()> {
        match &movement {
            Movement::Placement { player, coords } => {
                self.handle_placement(*player, *coords)?;
            }
            Movement::Action { player, action } => {
                self.handle_action(*player, action)?;
            }
        }
        self.history.push(movement);
        Ok(())
    }

    /// Orchestrates the placement logic
    fn handle_placement(&mut self, player: PlayerId, coords: Coordinates) -> Result<()> {
        self.validate_placement(player, coords)?;

        // Update board state (available cells, sets, board_map)
        let set_idx = self.register_piece(player, coords);

        // Connect neighbors and determine if this move won the game
        let won = self.connect_neighbors_and_check_win(coords, player, set_idx);

        self.update_status_after_placement(player, won);
        Ok(())
    }

    /// Iterates over neighbors to union sets and checks for a win condition
    fn connect_neighbors_and_check_win(
        &mut self,
        coords: Coordinates,
        player: PlayerId,
        current_set_idx: usize,
    ) -> bool {
        // Base win condition: The piece itself touches all required sides
        let mut won = self.sets[current_set_idx].is_winning_configuration();

        for neighbor in self.get_neighbors(&coords) {
            if let Some((neighbor_idx, neighbor_player)) = self.board_map.get(&neighbor)
                && *neighbor_player == player
            {
                // Union returns true if the merge resulted in a winning connection
                let connection_won = self.union(current_set_idx, *neighbor_idx);
                won = won || connection_won;
            }
        }
        won
    }

    /// Updates the game status (Finished vs Ongoing)
    fn update_status_after_placement(&mut self, player: PlayerId, won: bool) {
        if self.check_game_over() {
            tracing::info!("Game was already over. Move ignored for status update.");
        } else if won {
            tracing::debug!("Player {} wins the game!", player);
            self.status = GameStatus::Finished { winner: player };
        } else {
            // tracing::debug!("No win yet..."); // Optional debug
            self.status = GameStatus::Ongoing {
                next_player: GameY::other_player(player),
            };
        }
    }

    /// Handles non-placement actions (Resign, Swap, etc.)
    fn handle_action(&mut self, player: PlayerId, action: &GameAction) -> Result<()> {
        match action {
            GameAction::Resign => {
                self.status = GameStatus::Finished {
                    winner: GameY::other_player(player),
                };
            }
            GameAction::Swap => {
                self.validate_swap_action(player)?;
                self.swap_players();
                self.status = GameStatus::Ongoing {
                    next_player: GameY::other_player(player),
                };
            }
        }
        Ok(())
    }

    /// Handles validation logic (Game Over checks and Occupancy)
    fn validate_placement(&self, player: PlayerId, coords: Coordinates) -> Result<()> {
        if self.check_game_over() {
            tracing::info!("Game is already over. Move at {} could be ignored", coords);
        }

        if self.board_map.contains_key(&coords) {
            return Err(GameYError::Occupied {
                coordinates: coords,
                player,
            });
        }
        if self.blocked_cells.contains(&coords) {
            return Err(GameYError::BlockedCell {
                coordinates: coords,
                player,
            });
        }
        Ok(())
    }

    /// Updates internal data structures (Available cells, Sets, Map)
    /// Returns the index of the newly created set.
    fn register_piece(&mut self, player: PlayerId, coords: Coordinates) -> usize {
        let cell_idx = coords.to_index(self.board_size);
        self.mark_cell_unavailable(cell_idx);

        let set_idx = self.sets.len();
        let new_set = PlayerSet {
            parent: set_idx,
            touches_side_a: coords.touches_side_a(),
            touches_side_b: coords.touches_side_b(),
            touches_side_c: coords.touches_side_c(),
            size: 1,
            cells: vec![coords],
        };
        self.sets.push(new_set);
        self.board_map.insert(coords, (set_idx, player));

        set_idx
    }

    /// Returns the size of the board (length of one side of the triangle).
    pub fn board_size(&self) -> u32 {
        self.board_size
    }

    fn apply_honey_blocked_cells(&mut self) -> Result<()> {
        if !self.rules.honey.enabled {
            return Ok(());
        }

        for blocked in self.rules.honey.blocked_cells.clone() {
            let coords = self.coords_from_blocked_cell(&blocked)?;
            self.blocked_cells.insert(coords);
            let idx = coords.to_index(self.board_size);
            self.mark_cell_unavailable(idx);
        }
        Ok(())
    }

    fn coords_from_blocked_cell(&self, blocked: &crate::BlockedCell) -> Result<Coordinates> {
        let row = blocked.row;
        let col = blocked.col;
        if row >= self.board_size || col > row {
            return Err(GameYError::InvalidBlockedCellCoordinates {
                row,
                col,
                board_size: self.board_size,
            });
        }
        let x = self.board_size - 1 - row;
        let y = col;
        let z = row - col;
        Ok(Coordinates::new(x, y, z))
    }

    fn validate_swap_action(&self, player: PlayerId) -> Result<()> {
        if let GameStatus::Ongoing { next_player } = self.status {
            if next_player != player {
                return Err(GameYError::InvalidSwapAction {
                    player,
                    reason: format!(
                        "swap attempted out of turn (expected player {})",
                        next_player
                    ),
                });
            }
        }
        if !self.rules.pie_rule.enabled {
            return Err(GameYError::InvalidSwapAction {
                player,
                reason: "pie rule is disabled".to_string(),
            });
        }
        if player.id() != 1 {
            return Err(GameYError::InvalidSwapAction {
                player,
                reason: "only player 1 can invoke pie swap".to_string(),
            });
        }
        if self.history.len() != 1 {
            return Err(GameYError::InvalidSwapAction {
                player,
                reason: "swap is only allowed immediately after the opening move".to_string(),
            });
        }
        let opening_move_is_placement = matches!(self.history[0], Movement::Placement { .. });
        if !opening_move_is_placement {
            return Err(GameYError::InvalidSwapAction {
                player,
                reason: "swap requires an opening placement".to_string(),
            });
        }
        Ok(())
    }

    fn swap_players(&mut self) {
        for (_, (_, owner)) in self.board_map.iter_mut() {
            *owner = GameY::other_player(*owner);
        }
    }

    /// Returns the neighboring coordinates for a given cell.
    pub(crate) fn for_each_neighbor(
        &self,
        coords: &Coordinates,
        mut visit: impl FnMut(Coordinates),
    ) {
        let x = coords.x();
        let y = coords.y();
        let z = coords.z();

        if x > 0 {
            visit(Coordinates::new(x - 1, y + 1, z));
            visit(Coordinates::new(x - 1, y, z + 1));
        }
        if y > 0 {
            visit(Coordinates::new(x + 1, y - 1, z));
            visit(Coordinates::new(x, y - 1, z + 1));
        }
        if z > 0 {
            visit(Coordinates::new(x + 1, y, z - 1));
            visit(Coordinates::new(x, y + 1, z - 1));
        }
    }

    pub(crate) fn get_neighbors(&self, coords: &Coordinates) -> Vec<Coordinates> {
        let mut neighbors = Vec::with_capacity(6);
        self.for_each_neighbor(coords, |neighbor| neighbors.push(neighbor));
        neighbors
    }

    fn mark_cell_unavailable(&mut self, cell_idx: u32) {
        let lookup_idx = cell_idx as usize;
        let position = *self.available_lookup.get(lookup_idx).unwrap_or(&usize::MAX);
        if position == usize::MAX {
            return;
        }

        let last = self
            .available_cells
            .pop()
            .expect("available lookup referenced a missing cell");

        if position < self.available_cells.len() {
            self.available_cells[position] = last;
            self.available_lookup[last as usize] = position;
        }

        self.available_lookup[lookup_idx] = usize::MAX;
    }

    /// Renders the current state of the board as a text string.
    /// If `show_coordinates` is true, the coordinates of each cell will be displayed.
    pub fn render(&self, options: &RenderOptions) -> String {
        let mut result = String::new();
        let coords_size = self.board_size.to_string().len();
        let _ = writeln!(result, "--- Game of Y (Size {}) ---", self.board_size);

        let indent_multiplier = self.get_indent_multiplier(options);

        for row in 0..self.board_size {
            let x = self.board_size - 1 - row;
            indent(&mut result, x * indent_multiplier);

            for y in 0..=row {
                let z = row - y;
                let coords = Coordinates::new(x, y, z);
                let cell_str = self.format_cell(coords, options, coords_size);
                let _ = write!(result, "{}   ", cell_str);
            }

            result.push('\n');
            if options.show_idx || options.show_3d_coords {
                result.push('\n');
            }
        }
        result
    }
    /*pub fn render(&self, options: &RenderOptions) -> String {
        let mut result = String::new();
        let coords_size = self.board_size.to_string().len() as u32;

        let _ = writeln!(result, "--- Game of Y (Size {}) ---", self.board_size);

        for row in 0..self.board_size {
            let x = self.board_size - 1 - row;

            let indent_multiplier = match (options.show_3d_coords, options.show_idx) {
                (true, true) => 8,
                (true, false) => 4,
                (false, true) => 4,
                (false, false) => 2,
            };

            indent(&mut result, x * indent_multiplier);

            for y in 0..=row {
                let z = row - y;

                let coords = Coordinates::new(x, y, z);
                let player = self.board_map.get(&coords).map(|(_, p)| *p);

                let mut symbol = match player {
                    Some(p) => format!("{}", p),
                    None => ".".to_string(),
                };

                if options.show_3d_coords {
                    symbol.push_str(
                        format!(
                            "({:0width$},{:0width$},{:0width$})",
                            x,
                            y,
                            z,
                            width = coords_size as usize
                        )
                        .as_str(),
                    );
                }
                if options.show_idx {
                    let idx = coords.to_index(self.board_size);
                    symbol.push_str(format!("({}) ", idx).as_str());
                }
                if options.show_colors {
                    match player {
                        Some(p) if p.id() == 0 => {
                            symbol = format!("\x1b[34m{}\x1b[0m", symbol); // Blue for player 0
                        }
                        Some(p) if p.id() == 1 => {
                            symbol = format!("\x1b[31m{}\x1b[0m", symbol); // Red for player 1
                        }
                        _ => {}
                    }
                }

                let _ = write!(result, "{}   ", symbol);
            }
            result.push('\n');
            if options.show_idx || options.show_3d_coords {
                result.push('\n');
            }
        }
        result
    }*/

    fn get_indent_multiplier(&self, options: &RenderOptions) -> u32 {
        match (options.show_3d_coords, options.show_idx) {
            (true, true) => 8,
            (true, false) => 4,
            (false, true) => 4,
            (false, false) => 2,
        }
    }

    fn format_cell(&self, coords: Coordinates, options: &RenderOptions, width: usize) -> String {
        let player = self.board_map.get(&coords).map(|(_, p)| *p);

        // 1. Base symbol
        let mut symbol = match player {
            Some(p) => format!("{}", p),
            None => ".".to_string(),
        };

        // 2. Append metadata (3D Coords / Index)
        if options.show_3d_coords {
            symbol.push_str(&format!(
                "({:0w$},{:0w$},{:0w$})",
                coords.x(),
                coords.y(),
                coords.z(),
                w = width
            ));
        }
        if options.show_idx {
            let idx = coords.to_index(self.board_size);
            symbol.push_str(&format!("({}) ", idx));
        }

        // 3. Apply colors
        if options.show_colors {
            symbol = apply_player_color(symbol, player);
        }

        symbol
    }

    /// Disjoint Set Union 'Find' with path compression
    pub(crate) fn find(&mut self, i: SetIdx) -> SetIdx {
        if self.sets[i].parent == i {
            i
        } else {
            self.sets[i].parent = self.find(self.sets[i].parent);
            self.sets[i].parent
        }
    }
    /// Devuelve el PlayerId que ocupa una celda, o None si está vacía.
    pub fn cell_at(&self, coords: &Coordinates) -> Option<PlayerId> {
        self.board_map.get(coords).map(|(_, player)| *player)
    }

    /// Disjoint Set Union 'Union' operation
    fn union(&mut self, i: SetIdx, j: SetIdx) -> bool {
        let mut root_i = self.find(i);
        let mut root_j = self.find(j);

        if root_i != root_j {
            if self.sets[root_i].size > self.sets[root_j].size {
                std::mem::swap(&mut root_i, &mut root_j);
            }

            self.sets[root_i].parent = root_j;
            // Merge side properties
            self.sets[root_j].touches_side_a |= self.sets[root_i].touches_side_a;
            self.sets[root_j].touches_side_b |= self.sets[root_i].touches_side_b;
            self.sets[root_j].touches_side_c |= self.sets[root_i].touches_side_c;

            // We add their sizes
            self.sets[root_j].size += self.sets[root_i].size;
            let mut merged_cells = std::mem::take(&mut self.sets[root_i].cells);
            self.sets[root_j].cells.append(&mut merged_cells);

            return self.sets[root_j].touches_side_a
                && self.sets[root_j].touches_side_b
                && self.sets[root_j].touches_side_c;
        }
        false
    }

    pub fn other_player(player: PlayerId) -> PlayerId {
        // Assuming two players with IDs 0 and 1
        if player.id() == 0 {
            PlayerId::new(1)
        } else {
            PlayerId::new(0)
        }
    }

    pub fn play_coords(&mut self, coords: Coordinates) -> Result<()> {
        let player = self.next_player().ok_or(GameYError::GameAlreadyFinished)?;
        self.add_move(Movement::Placement { player, coords })
    }
}

fn indent(str: &mut String, level: u32) {
    str.push_str(&" ".repeat(level as usize));
}

impl TryFrom<YEN> for GameY {
    type Error = GameYError;

    fn try_from(game: YEN) -> Result<Self> {
        let rules = game.rules().cloned().unwrap_or_else(GameRules::classic);
        let mut ygame = GameY::with_rules(game.size(), rules)?;
        let rows: Vec<&str> = game.layout().split('/').collect();
        if rows.len() as u32 != game.size() {
            return Err(GameYError::InvalidYENLayout {
                expected: game.size(),
                found: rows.len() as u32,
            });
        }
        for (row, row_str) in rows.iter().enumerate() {
            let cells: Vec<char> = row_str.chars().collect();
            if cells.len() as u32 != row as u32 + 1 {
                return Err(GameYError::InvalidYENLayoutLine {
                    expected: row as u32 + 1,
                    found: cells.len() as u32,
                    line: row as u32,
                });
            }
            for (col, cell) in cells.iter().enumerate() {
                let x = game.size() - 1 - (row as u32);
                let y = col as u32;
                let z = game.size() - 1 - x - y;
                let coords = Coordinates::new(x, y, z);
                if ygame.blocked_cells.contains(&coords) && *cell != '.' {
                    return Err(GameYError::BlockedCell {
                        coordinates: coords,
                        player: PlayerId::new(0),
                    });
                }
                match cell {
                    'B' => {
                        ygame.add_move(Movement::Placement {
                            player: PlayerId::new(0),
                            coords,
                        })?;
                    }
                    'R' => {
                        ygame.add_move(Movement::Placement {
                            player: PlayerId::new(1),
                            coords,
                        })?;
                    }
                    '.' => {}
                    _ => {
                        return Err(GameYError::InvalidCharInLayout {
                            char: *cell,
                            row,
                            col,
                        });
                    }
                }
            }
        }
        Ok(ygame)
    }
}

impl From<&GameY> for YEN {
    fn from(game: &GameY) -> Self {
        let size = game.board_size;
        let turn = match game.status {
            GameStatus::Finished { winner } => GameY::other_player(winner).id() as u32,
            GameStatus::Ongoing { next_player } => next_player.id(),
        };
        let mut layout = String::new();
        let total_cells = (game.board_size * (game.board_size + 1)) / 2;
        let players = vec!['B', 'R'];
        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, game.board_size);
            let cell_char = match game.board_map.get(&coords) {
                Some((_, player)) if player.id() == 0 => 'B',
                Some((_, player)) if player.id() == 1 => 'R',
                _ => '.',
            };
            layout.push(cell_char);
            if coords.z() == 0 && coords.x() > 0 {
                layout.push('/');
            }
        }
        let mut yen = YEN::new(size, turn, players, layout);
        yen.set_rules(Some(game.rules.clone()));
        yen
    }
}

fn apply_player_color(symbol: String, player: Option<PlayerId>) -> String {
    match player {
        Some(p) if p.id() == 0 => format!("\x1b[34m{}\x1b[0m", symbol), // Blue
        Some(p) if p.id() == 1 => format!("\x1b[31m{}\x1b[0m", symbol), // Red
        _ => symbol,
    }
}

/// Represents the current status of a game.
#[derive(Debug, Clone)]
pub enum GameStatus {
    /// The game is still in progress with the specified player to move next.
    Ongoing { next_player: PlayerId },
    /// The game has ended with a winner.
    Finished { winner: PlayerId },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BlockedCell, HoneyRule, PieRule};
    use std::{collections::HashSet, fs};
    use tempfile::tempdir;

    #[test]
    fn test_other_player() {
        assert_eq!(GameY::other_player(PlayerId::new(0)), PlayerId::new(1));
        assert_eq!(GameY::other_player(PlayerId::new(1)), PlayerId::new(0));
    }

    #[test]
    fn test_game_initialization() {
        let game = GameY::new(7);
        assert_eq!(game.board_size, 7);
        assert_eq!(game.history.len(), 0);
        match game.status {
            GameStatus::Ongoing { next_player } => {
                assert_eq!(next_player, PlayerId::new(0));
            }
            _ => panic!("Game should be ongoing"),
        }
    }

    // Helper function to compare neighbor sets
    fn assert_neighbors_match(actual: Vec<Coordinates>, expected: Vec<Coordinates>) {
        let actual_set: HashSet<_> = actual.into_iter().collect();
        let expected_set: HashSet<_> = expected.into_iter().collect();
        assert_eq!(actual_set, expected_set);
    }

    #[test]
    fn test_interior_cell_has_six_neighbors() {
        let board = GameY::new(5);
        let cell = Coordinates::new(2, 1, 1);

        let neighbors = board.get_neighbors(&cell);

        let expected = vec![
            Coordinates::new(1, 2, 1),
            Coordinates::new(1, 1, 2),
            Coordinates::new(3, 0, 1),
            Coordinates::new(2, 0, 2),
            Coordinates::new(3, 1, 0),
            Coordinates::new(2, 2, 0),
        ];

        assert_eq!(neighbors.len(), 6);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_corner_cell_has_two_neighbors() {
        let board = GameY::new(5);
        let top_corner = Coordinates::new(4, 0, 0);

        let neighbors = board.get_neighbors(&top_corner);

        let expected = vec![Coordinates::new(3, 1, 0), Coordinates::new(3, 0, 1)];

        assert_eq!(neighbors.len(), 2);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_edge_cell_has_four_neighbors() {
        let board = GameY::new(5);
        let edge_cell = Coordinates::new(0, 2, 2);

        let neighbors = board.get_neighbors(&edge_cell);

        let expected = vec![
            Coordinates::new(1, 1, 2),
            Coordinates::new(0, 1, 3),
            Coordinates::new(1, 2, 1),
            Coordinates::new(0, 3, 1),
        ];

        assert_eq!(neighbors.len(), 4);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_winning_condition() {
        let mut game = GameY::new(3);

        let moves = vec![
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 2, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(1, 1, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 0, 2),
            },
        ];

        for mv in moves {
            game.add_move(mv).unwrap();
        }

        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            _ => panic!("Game should be finished with a winner"),
        }
    }

    #[test]
    fn test_yen_conversion() {
        let mut game = GameY::new(3);

        let moves = vec![
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 2, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(2, 0, 0),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(0, 1, 1),
            },
        ];

        for mv in moves {
            game.add_move(mv).unwrap();
        }

        let yen: YEN = (&game).into();
        let loaded_game = GameY::try_from(yen.clone()).unwrap();

        assert_eq!(game.board_size, loaded_game.board_size);
        let yen_loaded: YEN = (&loaded_game).into();
        assert_eq!(yen.layout(), yen_loaded.layout());
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_end2() {
        let yen_str = r#"{
            "size": 2,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B/BB"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            _ => panic!("Game should be finished with a winner"),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_end3() {
        let yen_str = r#"{
            "size": 3,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B/BB/BBR"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            other => panic!("Game should be finished with a winner. Found: {:?}", other),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_single_full() {
        let yen_str = r#"{
            "size": 1,
            "turn": 0,
            "players": ["B","R"],
            "layout": "B"
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Finished { winner } => {
                assert_eq!(winner, PlayerId::new(0));
            }
            other => panic!("Game should be finished with a winner. Found {:?}", other),
        }
    }

    // Test loading a YEN representation of a finished game
    #[test]
    fn test_load_yen_single_empty() {
        let yen_str = r#"{
            "size": 1,
            "turn": 0,
            "players": ["B","R"],
            "layout": "."
        }"#;
        let yen: YEN = serde_json::from_str(yen_str).unwrap();
        let game = GameY::try_from(yen).unwrap();
        match game.status {
            GameStatus::Ongoing { next_player } => {
                assert_eq!(next_player, PlayerId::new(0));
            }
            _ => panic!("Game should be ongoing"),
        }
    }

    /// Tests para cell_at, función necesaria para el Bot neuronal:
    #[test]
    fn test_cell_at_returns_correct_player() {
        let mut game = GameY::new(5);
        let coords = Coordinates::new(2, 1, 1);
        // Antes de colocar, la celda debe estar vacía
        assert_eq!(game.cell_at(&coords), None);

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords,
        })
            .unwrap();

        // Después de colocar, debe devolver el jugador correcto
        assert_eq!(game.cell_at(&coords), Some(PlayerId::new(0)));
    }

    #[test]
    fn test_cell_at_opponent_cell() {
        let mut game = GameY::new(5);
        let c0 = Coordinates::new(2, 1, 1);
        let c1 = Coordinates::new(2, 2, 0);

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: c0,
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: c1,
        })
            .unwrap();

        assert_eq!(game.cell_at(&c0), Some(PlayerId::new(0)));
        assert_eq!(game.cell_at(&c1), Some(PlayerId::new(1)));
        // Celda sin ocupar
        assert_eq!(game.cell_at(&Coordinates::new(0, 0, 0)), None);
    }

    #[test]
    fn test_sets_of_player_returns_unique_merged_root_with_all_cells() {
        let mut game = GameY::new(4);

        let first = Coordinates::new(0, 0, 3);
        let filler = Coordinates::new(3, 0, 0);
        let second = Coordinates::new(0, 1, 2);

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: first,
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: filler,
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: second,
        })
            .unwrap();

        let sets = game.sets_of_player(PlayerId::new(0));
        assert_eq!(
            sets.len(),
            1,
            "adjacent stones should collapse to one root set"
        );

        let merged = sets[0];
        assert_eq!(
            merged.size, 2,
            "merged root should track the full component size"
        );
        assert_eq!(
            merged.cells.len(),
            2,
            "merged root must keep every cell in the component"
        );
        assert!(merged.cells.contains(&first));
        assert!(merged.cells.contains(&second));
    }

    #[test]
    fn test_new_game_is_not_over() {
        let game = GameY::new(5);
        assert!(!game.check_game_over());
    }

    #[test]
    fn test_new_game_has_correct_total_cells() {
        assert_eq!(GameY::new(3).total_cells(), 6);
        assert_eq!(GameY::new(5).total_cells(), 15);
        assert_eq!(GameY::new(7).total_cells(), 28);
    }

    #[test]
    fn test_new_game_all_cells_available() {
        let game = GameY::new(5);
        assert_eq!(game.available_cells().len(), 15);
    }

    #[test]
    fn test_single_cell_board_initialization() {
        let game = GameY::new(1);
        assert_eq!(game.board_size(), 1);
        assert_eq!(game.total_cells(), 1);
        assert_eq!(game.available_cells().len(), 1);
    }

    #[test]
    fn test_single_move_changes_next_player() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();
        assert_eq!(game.next_player(), Some(PlayerId::new(1)));
    }

    #[test]
    fn test_two_moves_alternate_players() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(3, 1, 0),
        })
            .unwrap();
        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
    }

    #[test]
    fn test_move_decreases_available_cells() {
        let mut game = GameY::new(3);
        let initial_count = game.available_cells().len();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 0),
        })
            .unwrap();
        assert_eq!(game.available_cells().len(), initial_count - 1);
    }

    #[test]
    fn test_multiple_moves_track_available_cells() {
        let mut game = GameY::new(3);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(1, 1, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 2, 0),
        })
            .unwrap();
        assert_eq!(game.available_cells().len(), 3);
    }

    #[test]
    fn test_player_1_wins() {
        let mut game = GameY::new(3);
        let moves = vec![
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(2, 0, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(0, 0, 2),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(1, 1, 0),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(0, 1, 1),
            },
            Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::new(1, 0, 1),
            },
            Movement::Placement {
                player: PlayerId::new(1),
                coords: Coordinates::new(0, 2, 0),
            },
        ];

        for movement in moves {
            game.add_move(movement).unwrap();
        }

        assert!(game.check_game_over());
        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(1)),
            _ => panic!("game should be finished with player 1 as winner"),
        }
    }

    #[test]
    fn test_single_cell_board_instant_win() {
        let mut game = GameY::new(1);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 0),
        })
            .unwrap();

        assert!(game.check_game_over());
        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(0)),
            _ => panic!("game should be finished"),
        }
    }

    #[test]
    fn test_size_2_board_win() {
        let mut game = GameY::new(2);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 1),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(1, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 1, 0),
        })
            .unwrap();

        assert!(game.check_game_over());
        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(0)),
            _ => panic!("game should be finished"),
        }
    }

    #[test]
    fn test_game_not_over_without_three_sides() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 4),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();
        assert!(!game.check_game_over());
    }

    #[test]
    fn test_cannot_place_on_occupied_cell() {
        let mut game = GameY::new(5);
        let coords = Coordinates::new(2, 1, 1);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords,
        })
            .unwrap();

        let result = game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords,
        });

        match result.unwrap_err() {
            GameYError::Occupied { coordinates, .. } => assert_eq!(coordinates, coords),
            other => panic!("expected occupied error, got {other:?}"),
        }
    }

    #[test]
    fn test_check_player_turn_wrong_player() {
        let game = GameY::new(5);
        let movement = Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 1, 1),
        };

        match game.check_player_turn(&movement).unwrap_err() {
            GameYError::InvalidPlayerTurn { expected, found } => {
                assert_eq!(expected, PlayerId::new(0));
                assert_eq!(found, PlayerId::new(1));
            }
            other => panic!("expected invalid player turn, got {other:?}"),
        }
    }

    #[test]
    fn test_check_player_turn_correct_player() {
        let game = GameY::new(5);
        let movement = Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 1, 1),
        };
        assert!(game.check_player_turn(&movement).is_ok());
    }

    #[test]
    fn test_resign_ends_game_with_opponent_winning() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Action {
            player: PlayerId::new(0),
            action: GameAction::Resign,
        })
            .unwrap();

        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(1)),
            _ => panic!("game should be finished"),
        }
    }

    #[test]
    fn test_player_1_resign_makes_player_0_win() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Action {
            player: PlayerId::new(1),
            action: GameAction::Resign,
        })
            .unwrap();

        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(0)),
            _ => panic!("game should be finished"),
        }
    }

    #[test]
    fn test_swap_changes_next_player() {
        let mut game = GameY::with_rules(
            5,
            GameRules {
                pie_rule: PieRule { enabled: true },
                honey: HoneyRule::default(),
            },
        )
            .unwrap();

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Action {
            player: PlayerId::new(1),
            action: GameAction::Swap,
        })
            .unwrap();

        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
        assert!(!game.check_game_over());
    }

    #[test]
    fn test_swap_after_opening_move() {
        let mut game = GameY::with_rules(
            5,
            GameRules {
                pie_rule: PieRule { enabled: true },
                honey: HoneyRule::default(),
            },
        )
            .unwrap();

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 1, 1),
        })
            .unwrap();
        game.add_move(Movement::Action {
            player: PlayerId::new(1),
            action: GameAction::Swap,
        })
            .unwrap();

        assert_eq!(game.next_player(), Some(PlayerId::new(0)));
        assert!(!game.check_game_over());
    }

    #[test]
    fn test_swap_is_rejected_in_classic_mode() {
        let mut game = GameY::new(5);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(4, 0, 0),
        })
            .unwrap();

        let result = game.add_move(Movement::Action {
            player: PlayerId::new(1),
            action: GameAction::Swap,
        });

        assert!(matches!(result, Err(GameYError::InvalidSwapAction { .. })));
    }

    #[test]
    fn test_honey_rule_blocks_cells_when_enabled() {
        let mut game = GameY::with_rules(
            4,
            GameRules {
                pie_rule: PieRule::default(),
                honey: HoneyRule {
                    enabled: true,
                    blocked_cells: vec![BlockedCell { row: 1, col: 1 }],
                },
            },
        )
            .unwrap();

        let blocked = Coordinates::new(2, 1, 0);
        let result = game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: blocked,
        });

        assert!(matches!(result, Err(GameYError::BlockedCell { .. })));
    }

    #[test]
    fn test_honey_cells_are_playable_when_disabled() {
        let mut game = GameY::with_rules(
            4,
            GameRules {
                pie_rule: PieRule::default(),
                honey: HoneyRule {
                    enabled: false,
                    blocked_cells: vec![BlockedCell { row: 1, col: 1 }],
                },
            },
        )
            .unwrap();

        let allowed = Coordinates::new(2, 1, 0);
        let result = game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: allowed,
        });

        assert!(result.is_ok());
    }

    #[test]
    fn test_both_rules_enabled_apply_together() {
        let mut game = GameY::with_rules(
            4,
            GameRules {
                pie_rule: PieRule { enabled: true },
                honey: HoneyRule {
                    enabled: true,
                    blocked_cells: vec![BlockedCell { row: 1, col: 0 }],
                },
            },
        )
            .unwrap();

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(3, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Action {
            player: PlayerId::new(1),
            action: GameAction::Swap,
        })
            .unwrap();

        let blocked_result = game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 1),
        });
        assert!(matches!(blocked_result, Err(GameYError::BlockedCell { .. })));
    }

    #[test]
    fn test_yen_round_trip_empty_board() {
        let game = GameY::new(3);
        let yen: YEN = (&game).into();
        let loaded_game = GameY::try_from(yen).unwrap();

        assert_eq!(game.board_size(), loaded_game.board_size());
        assert_eq!(game.available_cells().len(), loaded_game.available_cells().len());
    }

    #[test]
    fn test_yen_preserves_board_state() {
        let yen: YEN = serde_json::from_str(
            r#"{
                "size": 3,
                "turn": 0,
                "players": ["B","R"],
                "layout": "B/RB/.R."
            }"#,
        )
            .unwrap();
        let game = GameY::try_from(yen).unwrap();

        assert_eq!(game.board_size(), 3);
        assert_eq!(game.available_cells().len(), 2);
    }

    #[test]
    fn test_yen_invalid_layout_wrong_rows() {
        let yen: YEN = serde_json::from_str(
            r#"{
                "size": 3,
                "turn": 0,
                "players": ["B","R"],
                "layout": "B/RB"
            }"#,
        )
            .unwrap();

        match GameY::try_from(yen).unwrap_err() {
            GameYError::InvalidYENLayout { expected, found } => {
                assert_eq!(expected, 3);
                assert_eq!(found, 2);
            }
            other => panic!("expected invalid yen layout, got {other:?}"),
        }
    }

    #[test]
    fn test_yen_invalid_layout_wrong_cells_in_row() {
        let yen: YEN = serde_json::from_str(
            r#"{
                "size": 3,
                "turn": 0,
                "players": ["B","R"],
                "layout": "B/RBB/..."
            }"#,
        )
            .unwrap();

        match GameY::try_from(yen).unwrap_err() {
            GameYError::InvalidYENLayoutLine {
                expected,
                found,
                line,
            } => {
                assert_eq!(expected, 2);
                assert_eq!(found, 3);
                assert_eq!(line, 1);
            }
            other => panic!("expected invalid yen layout line, got {other:?}"),
        }
    }

    #[test]
    fn test_yen_invalid_character() {
        let yen: YEN = serde_json::from_str(
            r#"{
                "size": 3,
                "turn": 0,
                "players": ["B","R"],
                "layout": "X/RB/..."
            }"#,
        )
            .unwrap();

        match GameY::try_from(yen).unwrap_err() {
            GameYError::InvalidCharInLayout { char, row, col } => {
                assert_eq!(char, 'X');
                assert_eq!(row, 0);
                assert_eq!(col, 0);
            }
            other => panic!("expected invalid char in layout, got {other:?}"),
        }
    }

    #[test]
    fn test_save_and_load_game_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_game.yen");
        let mut game = GameY::new(4);

        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(3, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 0, 1),
        })
            .unwrap();

        game.save_to_file(&file_path).unwrap();
        let loaded_game = GameY::load_from_file(&file_path).unwrap();

        assert_eq!(game.board_size(), loaded_game.board_size());
        assert_eq!(game.available_cells().len(), loaded_game.available_cells().len());

        let yen_original: YEN = (&game).into();
        let yen_loaded: YEN = (&loaded_game).into();
        assert_eq!(yen_original.layout(), yen_loaded.layout());
    }

    #[test]
    fn test_load_nonexistent_file() {
        let dir = tempdir().unwrap();
        let missing_file = dir.path().join("missing.yen");

        match GameY::load_from_file(&missing_file).unwrap_err() {
            GameYError::IoError { message, .. } => {
                assert!(message.contains("Failed to read file"));
            }
            other => panic!("expected io error, got {other:?}"),
        }
    }

    #[test]
    fn test_load_invalid_json_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("invalid.yen");
        fs::write(&file_path, "{ invalid json }").unwrap();

        match GameY::load_from_file(&file_path).unwrap_err() {
            GameYError::SerdeError { .. } => {}
            other => panic!("expected serde error, got {other:?}"),
        }
    }

    #[test]
    fn test_render_empty_board() {
        let game = GameY::new(3);
        let options = RenderOptions {
            show_3d_coords: false,
            show_idx: false,
            show_colors: false,
        };
        let rendered = game.render(&options);

        assert!(rendered.contains("Game of Y (Size 3)"));
        assert!(rendered.contains('.'));
    }

    #[test]
    fn test_render_with_pieces() {
        let mut game = GameY::new(3);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(2, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(1, 1, 0),
        })
            .unwrap();

        let options = RenderOptions {
            show_3d_coords: false,
            show_idx: false,
            show_colors: false,
        };
        let rendered = game.render(&options);

        assert!(rendered.contains('0'));
        assert!(rendered.contains('1'));
    }

    #[test]
    fn test_render_with_3d_coords() {
        let game = GameY::new(2);
        let options = RenderOptions {
            show_3d_coords: true,
            show_idx: false,
            show_colors: false,
        };
        let rendered = game.render(&options);

        assert!(rendered.contains('('));
        assert!(rendered.contains(')'));
    }

    #[test]
    fn test_render_with_indices() {
        let game = GameY::new(2);
        let options = RenderOptions {
            show_3d_coords: false,
            show_idx: true,
            show_colors: false,
        };
        let rendered = game.render(&options);

        assert!(rendered.contains("(0)") || rendered.contains("(1)") || rendered.contains("(2)"));
    }

    #[test]
    fn test_full_game_on_size_4_board() {
        let mut game = GameY::new(4);
        let moves = vec![
            (0, Coordinates::new(3, 0, 0)),
            (1, Coordinates::new(2, 1, 0)),
            (0, Coordinates::new(2, 0, 1)),
            (1, Coordinates::new(1, 2, 0)),
            (0, Coordinates::new(1, 0, 2)),
            (1, Coordinates::new(0, 3, 0)),
            (0, Coordinates::new(0, 0, 3)),
            (1, Coordinates::new(0, 2, 1)),
            (0, Coordinates::new(1, 1, 1)),
        ];

        for (player_id, coords) in moves {
            game.add_move(Movement::Placement {
                player: PlayerId::new(player_id),
                coords,
            })
                .unwrap();
        }

        assert!(game.available_cells().len() < 10);
    }

    #[test]
    fn test_union_find_correctly_merges_components() {
        let mut game = GameY::new(4);
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 3),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(3, 0, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 3, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 1, 0),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 1, 2),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(1),
            coords: Coordinates::new(2, 0, 1),
        })
            .unwrap();
        game.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 2, 1),
        })
            .unwrap();

        assert!(game.check_game_over());
        match game.status() {
            GameStatus::Finished { winner } => assert_eq!(*winner, PlayerId::new(0)),
            _ => panic!("player 0 should have won"),
        }
    }
}

use std::sync::Arc;
use crate::{Coordinates, GameY, Movement, PlayerId, YBot};
use crate::bot::neural_net::NeuralNet;

// ─────────────────────────────────────────────
//  Nodo del árbol MCTS
// ─────────────────────────────────────────────

struct MctsNode {
    /// Movimiento que llevó a este nodo (None en la raíz)
    action: Option<Coordinates>,

    /// Prior dado por la red neuronal P(s, a)
    prior: f32,

    /// Número de veces que se ha visitado este nodo
    visits: u32,

    /// Suma acumulada de valores (para calcular Q)
    value_sum: f32,

    /// Hijos expandidos: uno por movimiento legal
    children: Vec<MctsNode>,

    /// Si este nodo ya fue expandido
    expanded: bool,
}

impl MctsNode {
    fn new(action: Option<Coordinates>, prior: f32) -> Self {
        Self {
            action,
            prior,
            visits: 0,
            value_sum: 0.0,
            children: Vec::new(),
            expanded: false,
        }
    }

    /// Q(s, a): valor medio observado
    fn q_value(&self) -> f32 {
        if self.visits == 0 {
            0.0
        } else {
            self.value_sum / self.visits as f32
        }
    }

    /// Puntuación PUCT para selección (AlphaZero-style)
    /// PUCT = Q(s,a) + C * P(s,a) * sqrt(N_parent) / (1 + N(s,a))
    fn puct_score(&self, parent_visits: u32, c: f32) -> f32 {
        let u = c * self.prior * (parent_visits as f32).sqrt()
            / (1.0 + self.visits as f32);
        self.q_value() + u
    }

    /// Índice del hijo con mayor puntuación PUCT
    fn best_child_idx(&self, c: f32) -> Option<usize> {
        if self.children.is_empty() {
            return None;
        }
        self.children
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| {
                a.puct_score(self.visits, c)
                    .partial_cmp(&b.puct_score(self.visits, c))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(i, _)| i)
    }

    /// Índice del hijo más visitado (para elegir el movimiento final)
    fn most_visited_child_idx(&self) -> Option<usize> {
        self.children
            .iter()
            .enumerate()
            .max_by_key(|(_, c)| c.visits)
            .map(|(i, _)| i)
    }
}

// ─────────────────────────────────────────────
//  Bot
// ─────────────────────────────────────────────

/// Bot que combina MCTS con una red neuronal (estilo AlphaZero).
/// La red guía la búsqueda con priors de política y evaluaciones de valor,
/// eliminando la necesidad de simulaciones aleatorias.
pub struct NeuralMctsBot {
    name: String,
    net: Arc<NeuralNet>,

    /// Número de simulaciones MCTS por movimiento.
    /// Más simulaciones = más fuerte pero más lento.
    /// Recomendado: 200 (fácil), 800 (difícil), 2000 (imbatible)
    simulations: u32,

    /// Constante de exploración PUCT (típicamente sqrt(2) ≈ 1.41)
    c_puct: f32,
}

impl NeuralMctsBot {
    pub fn new(net: Arc<NeuralNet>, simulations: u32) -> Self {
        let name = format!("neural_mcts_s{}", simulations);
        Self {
            name,
            net,
            simulations,
            c_puct: std::f32::consts::SQRT_2,
        }
    }

    /// Ejecuta una simulación MCTS completa desde la raíz.
    /// Navega el árbol, expande, evalúa con la red y propaga el valor.
    fn run_simulation(&self, root: &mut MctsNode, board: &GameY) {
        // Reconstruimos el camino de estados aplicando movimientos
        let mut path: Vec<usize> = Vec::new();
        let mut current_board = board.clone();

        // ── 1. Selection ──────────────────────────────────────────────
        // Navega hasta un nodo hoja siguiendo PUCT
        let mut node_ptr: *mut MctsNode = root;
        loop {
            let node = unsafe { &mut *node_ptr };

            if !node.expanded || node.children.is_empty() {
                break;
            }

            if current_board.check_game_over() {
                break;
            }

            match node.best_child_idx(self.c_puct) {
                None => break,
                Some(idx) => {
                    path.push(idx);
                    let child = &node.children[idx];
                    if let Some(coords) = child.action {
                        let player = current_board.next_player().unwrap();
                        let _ = current_board.add_move(Movement::Placement {
                            player,
                            coords,
                        });
                    }
                    node_ptr = &mut node.children[idx] as *mut MctsNode;
                }
            }
        }

        // ── 2. Expansion + Evaluation ─────────────────────────────────
        let leaf = unsafe { &mut *node_ptr };
        let value = if current_board.check_game_over() {
            // Nodo terminal: victoria o derrota
            if let Some(winner) = current_board.winner() {
                let root_player = board.next_player().unwrap_or(PlayerId::new(0));
                if winner == root_player { 1.0 } else { -1.0 }
            } else {
                0.0
            }
        } else {
            // Evalúa con la red neuronal
            match self.net.evaluate(&current_board) {
                Ok((policy, value)) => {
                    // Expande con los priors de la red
                    let moves: Vec<Coordinates> = current_board
                        .available_cells()
                        .iter()
                        .map(|&idx| Coordinates::from_index(idx, current_board.board_size()))
                        .collect();

                    leaf.children = moves
                        .into_iter()
                        .map(|coords| {
                            let cell_idx = coords.to_index(current_board.board_size()) as usize;
                            let prior = if cell_idx < policy.len() {
                                policy[cell_idx]
                            } else {
                                1.0 / current_board.available_cells().len() as f32
                            };
                            MctsNode::new(Some(coords), prior)
                        })
                        .collect();

                    leaf.expanded = true;
                    value
                }
                Err(_) => {
                    // Fallback: expande con prior uniforme, value = 0
                    let moves: Vec<Coordinates> = current_board
                        .available_cells()
                        .iter()
                        .map(|&idx| Coordinates::from_index(idx, current_board.board_size()))
                        .collect();
                    let n = moves.len();
                    leaf.children = moves
                        .into_iter()
                        .map(|c| MctsNode::new(Some(c), 1.0 / n as f32))
                        .collect();
                    leaf.expanded = true;
                    0.0
                }
            }
        };

        // ── 3. Backpropagation ────────────────────────────────────────
        // Propaga el valor hacia arriba alternando signo
        let mut node_ptr: *mut MctsNode = root;
        let mut v = value;

        root.visits += 1;
        root.value_sum += v;
        v = -v;

        for &idx in &path {
            let node = unsafe { &mut *node_ptr };
            node_ptr = &mut node.children[idx] as *mut MctsNode;
            let child = unsafe { &mut *node_ptr };
            child.visits += 1;
            child.value_sum += v;
            v = -v;
        }
    }
}

impl YBot for NeuralMctsBot {
    fn name(&self) -> &str {
        &self.name
    }

    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        if board.check_game_over() {
            return None;
        }

        let moves: Vec<Coordinates> = board
            .available_cells()
            .iter()
            .map(|&idx| Coordinates::from_index(idx, board.board_size()))
            .collect();

        if moves.is_empty() {
            return None;
        }

        // Caso trivial: un solo movimiento posible
        if moves.len() == 1 {
            return Some(moves[0]);
        }

        // Inicializa raíz con prior uniforme
        let n = moves.len();
        let mut root = MctsNode::new(None, 1.0);
        root.children = moves
            .into_iter()
            .map(|c| MctsNode::new(Some(c), 1.0 / n as f32))
            .collect();
        root.expanded = true;
        root.visits = 1;

        // Ejecuta las simulaciones
        for _ in 0..self.simulations {
            self.run_simulation(&mut root, board);
        }

        // Elige el movimiento más visitado
        root.most_visited_child_idx()
            .and_then(|idx| root.children[idx].action)
    }
}

// ─────────────────────────────────────────────
//  Tests
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::GameY;

    fn make_bot(simulations: u32) -> NeuralMctsBot {
        let net = NeuralNet::load("models/yovi_model.onnx")
            .expect("Modelo ONNX no encontrado en models/yovi_model.onnx");
        NeuralMctsBot::new(net, simulations)
    }

    #[test]
    fn test_choose_move_returns_valid_move() {
        let bot   = make_bot(50);
        let board = GameY::new(5);
        let mv    = bot.choose_move(&board);
        assert!(mv.is_some());
        let idx = mv.unwrap().to_index(board.board_size());
        assert!(board.available_cells().contains(&idx));
    }

    #[test]
    fn test_choose_move_on_finished_game_returns_none() {
        let bot = make_bot(10);
        // Tablero 1×1: el primer movimiento gana inmediatamente
        let mut board = GameY::new(1);
        board.add_move(Movement::Placement {
            player: PlayerId::new(0),
            coords: Coordinates::new(0, 0, 0),
        }).unwrap();
        assert!(board.check_game_over());
        assert_eq!(bot.choose_move(&board), None);
    }

    #[test]
    fn test_bot_plays_full_game() {
        let bot   = make_bot(50);
        let mut board = GameY::new(5);
        let mut moves = 0;
        while !board.check_game_over() {
            let mv = bot.choose_move(&board).expect("Bot debe devolver movimiento");
            let player = board.next_player().unwrap();
            board.add_move(Movement::Placement { player, coords: mv }).unwrap();
            moves += 1;
            assert!(moves < 200, "La partida no debería durar tanto");
        }
        assert!(board.winner().is_some());
    }
}

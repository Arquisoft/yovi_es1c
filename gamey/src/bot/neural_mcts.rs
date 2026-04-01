use std::sync::Arc;
use std::collections::HashMap;
use rayon::prelude::*;

use crate::{Coordinates, GameY, Movement, YBot};
use crate::bot::neural_net::NeuralNet;

// ─────────────────────────────────────────────
//  MctsNode
// ─────────────────────────────────────────────

#[derive(Debug)]
pub struct MctsNode {
    pub action: Option<Coordinates>,
    pub prior: f32,
    pub visits: u32,
    pub value_sum: f32,
    pub children: Vec<MctsNode>,
    pub expanded: bool,
}

impl MctsNode {
    pub fn new(action: Option<Coordinates>, prior: f32) -> Self {
        Self {
            action,
            prior,
            visits: 0,
            value_sum: 0.0,
            children: Vec::new(),
            expanded: false,
        }
    }

    pub fn q_value(&self) -> f32 {
        if self.visits == 0 {
            0.0
        } else {
            self.value_sum / self.visits as f32
        }
    }

    pub fn ucb_score(&self, parent_visits: u32, c_puct: f32) -> f32 {
        let exploration = c_puct
            * self.prior
            * (parent_visits as f32).sqrt()
            / (1.0 + self.visits as f32);
        self.q_value() + exploration
    }

    pub fn best_child_coords(&self) -> Option<Coordinates> {
        self.children
            .iter()
            .max_by_key(|c| c.visits)
            .and_then(|c| c.action)
    }
}

// ─────────────────────────────────────────────
//  NeuralMctsBot
// ─────────────────────────────────────────────

pub struct NeuralMctsBot {
    name: String,
    net: Arc<NeuralNet>,
    simulations: u32,
    c_puct: f32,
    pub use_dirichlet: bool,
}

impl NeuralMctsBot {
    pub fn new(net: Arc<NeuralNet>, simulations: u32) -> Self {
        Self {
            name: format!("neural_mcts_s{}", simulations),
            net,
            simulations,
            c_puct: std::f32::consts::SQRT_2,
            use_dirichlet: false,
        }
    }

    pub fn new_self_play(net: Arc<NeuralNet>, simulations: u32) -> Self {
        let mut bot = Self::new(net, simulations);
        bot.use_dirichlet = true;
        bot
    }

    // ── Simulación ────────────────────────────

    fn run_simulation(&self, root: &mut MctsNode, board: &GameY, local_cache: &mut HashMap<u64, (Vec<f32>, f32)>) {
        let mut path: Vec<*mut MctsNode> = vec![root as *mut MctsNode];
        let mut current_board = board.clone();

        // ── Selección ──
        let mut node = root;
        loop {
            if !node.expanded || node.children.is_empty() { break; }
            if current_board.check_game_over() { break; }

            let parent_visits = node.visits;
            let best_idx = node.children.iter().enumerate().max_by(|(_, a), (_, b)| {
                a.ucb_score(parent_visits, self.c_puct)
                    .partial_cmp(&b.ucb_score(parent_visits, self.c_puct))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }).unwrap().0;

            let chosen_action = node.children[best_idx].action.unwrap();
            let player = current_board.next_player().unwrap();
            current_board.add_move(Movement::Placement { player, coords: chosen_action }).unwrap();

            node = &mut node.children[best_idx];
            path.push(node as *mut MctsNode);
        }

        // ── Expansión / Evaluación ──
        let leaf = node;
        let value: f32;

        if current_board.check_game_over() {
            value = match current_board.winner() { Some(_) => -1.0, None => 0.0 };
        } else if !leaf.expanded {
            // USAMOS LA CACHÉ LOCAL AQUÍ
            let key = NeuralNet::board_hash(&current_board);
            let (policy, v) = if let Some(cached) = local_cache.get(&key) {
                cached.clone()
            } else {
                let res = self.net.evaluate(&current_board)
                    .unwrap_or_else(|_| NeuralNet::fallback_evaluation(&current_board));
                local_cache.insert(key, res.clone());
                res
            };
            value = v;

            let available = current_board.available_cells();
            leaf.children = available.iter().map(|&idx| {
                let coords = Coordinates::from_index(idx, current_board.board_size());
                let prior = if (idx as usize) < policy.len() { policy[idx as usize] } else { 1.0 / available.len() as f32 };
                MctsNode::new(Some(coords), prior)
            }).collect();
            leaf.expanded = true;
        } else {
            // Y TAMBIÉN AQUÍ
            let key = NeuralNet::board_hash(&current_board);
            value = if let Some(cached) = local_cache.get(&key) {
                cached.1
            } else {
                let res = self.net.evaluate(&current_board).unwrap_or_else(|_| NeuralNet::fallback_evaluation(&current_board));
                local_cache.insert(key, res.clone());
                res.1
            };
        }

        // ── Backpropagation ──
        let mut flip = false;
        for node_ptr in path.iter().rev() {
            let n = unsafe { &mut **node_ptr };
            n.visits += 1;
            n.value_sum += if flip { -value } else { value };
            flip = !flip;
        }
    }

    // ── Dirichlet (self-play) ─────────────────

    fn add_dirichlet_noise(&self, node: &mut MctsNode) {
        if node.children.is_empty() {
            return;
        }
        let alpha = 0.3_f32;
        let epsilon = 0.25_f32;
        let n = node.children.len();

        let mut noise: Vec<f32> = (0..n)
            .map(|_| {
                let u: f32 = rand::random::<f32>().max(1e-10);
                (-u.ln() * alpha).recip()
            })
            .collect();
        let sum: f32 = noise.iter().sum();
        for x in &mut noise { *x /= sum; }

        for (child, &ni) in node.children.iter_mut().zip(noise.iter()) {
            child.prior = (1.0 - epsilon) * child.prior + epsilon * ni;
        }
    }
}

// ─────────────────────────────────────────────
//  Implementación de YBot
// ─────────────────────────────────────────────

impl YBot for NeuralMctsBot {
    fn name(&self) -> &str {
        &self.name
    }

    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        let moves = board.available_cells();
        if moves.is_empty() {
            return None;
        }
        if moves.len() == 1 {
            return Some(Coordinates::from_index(moves[0], board.board_size()));
        }

        let moves_coords: Vec<Coordinates> = moves
            .iter()
            .map(|&idx| Coordinates::from_index(idx, board.board_size()))
            .collect();

        // Extraemos todo el jugo a tu CPU
        let num_threads = rayon::current_num_threads().max(1);
        let sims_per_thread = self.simulations / num_threads as u32;
        let n = moves_coords.len();

        // Creamos múltiples árboles de forma paralela
        let trees: Vec<MctsNode> = (0..num_threads)
            .into_par_iter()
            .map(|_| {
                // Creamos una caché local exclusiva para este hilo
                let mut local_cache: HashMap<u64, (Vec<f32>, f32)> = HashMap::with_capacity(1000);

                let uniform = 1.0 / n as f32;
                let mut local_root = MctsNode::new(None, 1.0);
                local_root.children = moves_coords.iter().map(|&c| MctsNode::new(Some(c), uniform)).collect();
                local_root.expanded = true;
                local_root.visits = 1;

                if self.use_dirichlet {
                    self.add_dirichlet_noise(&mut local_root);
                }

                for _ in 0..sims_per_thread {
                    // Pasamos la caché local
                    self.run_simulation(&mut local_root, board, &mut local_cache);
                }
                local_root
            })
            .collect();

        // Juntamos los resultados de todos los hilos
        let mut aggregate: HashMap<u32, u32> = HashMap::new();
        for tree in &trees {
            for child in &tree.children {
                if let Some(coords) = child.action {
                    let idx = coords.to_index(board.board_size());
                    *aggregate.entry(idx).or_insert(0) += child.visits;
                }
            }
        }

        // Devolvemos el movimiento que más se ha explorado en total
        aggregate
            .into_iter()
            .max_by_key(|(_, v)| *v)
            .map(|(idx, _)| Coordinates::from_index(idx, board.board_size()))
    }
}
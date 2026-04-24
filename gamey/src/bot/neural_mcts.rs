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
        Self { action, prior, visits: 0, value_sum: 0.0, children: Vec::new(), expanded: false }
    }

    pub fn q_value(&self) -> f32 {
        if self.visits == 0 { 0.0 } else { self.value_sum / self.visits as f32 }
    }

    pub fn ucb_score(&self, parent_visits: u32, c_puct: f32) -> f32 {
        let exploration = c_puct * self.prior * (parent_visits as f32).sqrt() / (1.0 + self.visits as f32);
        self.q_value() + exploration
    }

    pub fn best_child_coords(&self) -> Option<Coordinates> {
        self.children.iter().max_by_key(|c| c.visits).and_then(|c| c.action)
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
    early_stop: Option<EarlyStopConfig>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EarlyStopConfig {
    pub visit_ratio: f32,
    pub min_visits: u32,
}

impl NeuralMctsBot {
    pub fn new(net: Arc<NeuralNet>, simulations: u32) -> Self {
        Self {
            name: format!("neural_mcts_s{}", simulations),
            net,
            simulations,
            c_puct: std::f32::consts::SQRT_2,
            use_dirichlet: false,
            early_stop: None,
        }
    }

    pub fn new_self_play(net: Arc<NeuralNet>, simulations: u32) -> Self {
        let mut bot = Self::new(net, simulations);
        bot.use_dirichlet = true;
        bot
    }

    pub fn with_early_stop(mut self, visit_ratio: f32, min_visits: u32) -> Self {
        self.early_stop = Some(EarlyStopConfig {
            visit_ratio,
            min_visits,
        });
        self
    }

    fn build_root(board: &GameY, policy: &[f32]) -> MctsNode {
        let available = board.available_cells();
        let uniform = if available.is_empty() { 0.0 } else { 1.0 / available.len() as f32 };
        let mut root = MctsNode::new(None, 1.0);
        root.children = available
            .iter()
            .map(|&idx| {
                let coords = Coordinates::from_index(idx, board.board_size());
                let prior = policy.get(idx as usize).copied().unwrap_or(0.0).max(0.0);
                MctsNode::new(Some(coords), prior)
            })
            .collect();

        let prior_sum: f32 = root.children.iter().map(|child| child.prior).sum();
        if prior_sum > 0.0 {
            for child in &mut root.children {
                child.prior /= prior_sum;
            }
        } else {
            for child in &mut root.children {
                child.prior = uniform;
            }
        }

        root.expanded = true;
        root.visits = 1;
        root
    }

    fn simulation_budgets(total: u32, workers: usize) -> Vec<u32> {
        if workers == 0 {
            return Vec::new();
        }

        let worker_count = workers.min(total.max(1) as usize);
        let base = total / worker_count as u32;
        let remainder = total % worker_count as u32;

        (0..worker_count)
            .map(|idx| base + u32::from(idx < remainder as usize))
            .collect()
    }

    fn get_cached_value(&self, board: &GameY, local_cache: &mut HashMap<u64, (Vec<f32>, f32)>) -> f32 {
        let key = NeuralNet::board_hash(board);
        if let Some(cached) = local_cache.get(&key) { return cached.1; }
        let res = self.net.evaluate(board).unwrap_or_else(|_| NeuralNet::fallback_evaluation(board));
        let value = res.1;
        local_cache.insert(key, res);
        value
    }

    fn expand_leaf(&self, leaf: &mut MctsNode, board: &GameY, local_cache: &mut HashMap<u64, (Vec<f32>, f32)>) -> f32 {
        let key = NeuralNet::board_hash(board);
        let (policy, value) = if let Some(cached) = local_cache.get(&key) {
            cached.clone()
        } else {
            let res = self.net.evaluate(board).unwrap_or_else(|_| NeuralNet::fallback_evaluation(board));
            local_cache.insert(key, res.clone());
            res
        };
        Self::expand_leaf_with_policy(leaf, board, &policy);
        value
    }

    fn expand_leaf_with_policy(leaf: &mut MctsNode, board: &GameY, policy: &[f32]) {
        let available = board.available_cells();
        let uniform = if available.is_empty() { 0.0 } else { 1.0 / available.len() as f32 };
        leaf.children = available
            .iter()
            .map(|&idx| {
                let coords = Coordinates::from_index(idx, board.board_size());
                let prior = policy.get(idx as usize).copied().unwrap_or(uniform).max(0.0);
                MctsNode::new(Some(coords), prior)
            })
            .collect();

        let prior_sum: f32 = leaf.children.iter().map(|child| child.prior).sum();
        if prior_sum > 0.0 {
            for child in &mut leaf.children {
                child.prior /= prior_sum;
            }
        } else {
            for child in &mut leaf.children {
                child.prior = uniform;
            }
        }
        leaf.expanded = true;
    }

    fn run_simulation(&self, root: &mut MctsNode, board: &GameY, local_cache: &mut HashMap<u64, (Vec<f32>, f32)>) {
        let mut path: Vec<*mut MctsNode> = vec![root as *mut MctsNode];
        let mut current_board = board.clone();
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

        let leaf = node;
        let value: f32 = if current_board.check_game_over() {
            match current_board.winner() { Some(_) => -1.0, None => 0.0 }
        } else if !leaf.expanded {
            self.expand_leaf(leaf, &current_board, local_cache)
        } else {
            self.get_cached_value(&current_board, local_cache)
        };

        let mut flip = false;
        for node_ptr in path.iter().rev() {
            let n = unsafe { &mut **node_ptr };
            n.visits += 1;
            n.value_sum += if flip { -value } else { value };
            flip = !flip;
        }
    }

    fn should_stop_early(root: &MctsNode, config: EarlyStopConfig) -> bool {
        if root.children.is_empty() {
            return false;
        }

        let total_visits: u32 = root.children.iter().map(|child| child.visits).sum();
        if total_visits < config.min_visits {
            return false;
        }

        let best_visits = root.children.iter().map(|child| child.visits).max().unwrap_or(0);
        if best_visits == 0 {
            return false;
        }

        (best_visits as f32 / total_visits as f32) >= config.visit_ratio
    }

    fn add_dirichlet_noise(&self, node: &mut MctsNode) {
        if node.children.is_empty() { return; }
        let alpha = 0.3_f32;
        let epsilon = 0.25_f32;
        let n = node.children.len();
        let mut noise: Vec<f32> = (0..n).map(|_| {
            let u: f32 = rand::random::<f32>().max(1e-10);
            (-u.ln() * alpha).recip()
        }).collect();
        let sum: f32 = noise.iter().sum();
        for x in &mut noise { *x /= sum; }
        for (child, &ni) in node.children.iter_mut().zip(noise.iter()) {
            child.prior = (1.0 - epsilon) * child.prior + epsilon * ni;
        }
    }

    fn run_worker_tree(&self, board: &GameY, root_policy: &[f32], worker_budget: u32) -> MctsNode {
        let mut local_cache: HashMap<u64, (Vec<f32>, f32)> = HashMap::with_capacity(1000);
        let mut local_root = Self::build_root(board, root_policy);
        if self.use_dirichlet {
            self.add_dirichlet_noise(&mut local_root);
        }

        for _ in 0..worker_budget {
            self.run_simulation(&mut local_root, board, &mut local_cache);
            if self.should_break_worker_loop(&local_root) {
                break;
            }
        }

        local_root
    }

    fn should_break_worker_loop(&self, root: &MctsNode) -> bool {
        self.early_stop
            .is_some_and(|config| Self::should_stop_early(root, config))
    }

    fn aggregate_tree_visits(trees: &[MctsNode], board_size: u32) -> HashMap<u32, u32> {
        let mut aggregate = HashMap::new();
        for tree in trees {
            for child in &tree.children {
                if let Some(coords) = child.action {
                    let idx = coords.to_index(board_size);
                    *aggregate.entry(idx).or_insert(0) += child.visits;
                }
            }
        }
        aggregate
    }

    fn fallback_best_prior(root: &MctsNode) -> Option<Coordinates> {
        root.children
            .iter()
            .max_by(|left, right| {
                left.prior
                    .partial_cmp(&right.prior)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .and_then(|child| child.action)
    }

    fn best_aggregated_move(
        aggregate: &HashMap<u32, u32>,
        board_size: u32,
        fallback_root: &MctsNode,
    ) -> Option<Coordinates> {
        aggregate
            .iter()
            .max_by_key(|(_, visits)| **visits)
            .and_then(|(idx, visits)| {
                if *visits > 0 {
                    Some(Coordinates::from_index(*idx, board_size))
                } else {
                    Self::fallback_best_prior(fallback_root)
                }
            })
            .or_else(|| Self::fallback_best_prior(fallback_root))
    }
}

impl YBot for NeuralMctsBot {
    fn name(&self) -> &str { &self.name }

    fn choose_move(&self, board: &GameY) -> Option<Coordinates> {
        let moves = board.available_cells();
        if moves.is_empty() { return None; }
        if moves.len() == 1 { return Some(Coordinates::from_index(moves[0], board.board_size())); }

        let worker_count = rayon::current_num_threads().max(1);
        let budgets = Self::simulation_budgets(self.simulations, worker_count);
        let (root_policy, _) = self.net.evaluate(board).unwrap_or_else(|_| NeuralNet::fallback_evaluation(board));
        let fallback_root = Self::build_root(board, &root_policy);
        let trees: Vec<MctsNode> = budgets
            .into_par_iter()
            .map(|worker_budget| self.run_worker_tree(board, &root_policy, worker_budget))
            .collect();

        let aggregate = Self::aggregate_tree_visits(&trees, board.board_size());
        Self::best_aggregated_move(&aggregate, board.board_size(), &fallback_root)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::PlayerId;

    #[test]
    fn new_node_has_zero_visits_and_not_expanded() {
        let node = MctsNode::new(None, 0.5);
        assert_eq!(node.visits, 0);
        assert_eq!(node.value_sum, 0.0);
        assert!(!node.expanded);
        assert!(node.children.is_empty());
        assert_eq!(node.prior, 0.5);
        assert!(node.action.is_none());
    }

    #[test]
    fn q_value_returns_zero_when_no_visits() {
        let node = MctsNode::new(None, 1.0);
        assert_eq!(node.q_value(), 0.0);
    }

    #[test]
    fn q_value_is_value_sum_over_visits() {
        let mut node = MctsNode::new(None, 1.0);
        node.visits = 4;
        node.value_sum = 2.0;
        assert!((node.q_value() - 0.5).abs() < 1e-6);
    }

    #[test]
    fn ucb_score_unvisited_node_is_exploration_only() {
        let node = MctsNode::new(None, 1.0);
        let score = node.ucb_score(9, 1.0);
        assert!((score - 3.0).abs() < 1e-5, "got {score}");
    }

    #[test]
    fn ucb_score_visited_node_adds_q_value() {
        let mut node = MctsNode::new(None, 1.0);
        node.visits = 1;
        node.value_sum = 1.0;
        let score = node.ucb_score(4, 1.0);
        assert!((score - 2.0).abs() < 1e-5, "got {score}");
    }

    #[test]
    fn best_child_coords_returns_most_visited() {
        let mut root = MctsNode::new(None, 1.0);
        let mut c1 = MctsNode::new(Some(Coordinates::from_index(0, 5)), 0.5);
        let mut c2 = MctsNode::new(Some(Coordinates::from_index(1, 5)), 0.5);
        let mut c3 = MctsNode::new(Some(Coordinates::from_index(2, 5)), 0.5);
        c1.visits = 3;
        c2.visits = 10;
        c3.visits = 1;
        root.children = vec![c1, c2, c3];

        let best = root.best_child_coords().unwrap();
        assert_eq!(best, Coordinates::from_index(1, 5));
    }

    #[test]
    fn best_child_coords_returns_none_when_no_children() {
        let root = MctsNode::new(None, 1.0);
        assert!(root.best_child_coords().is_none());
    }

    #[test]
    fn new_bot_has_correct_name_and_defaults() {
        let name = format!("neural_mcts_s{}", 50u32);
        assert_eq!(name, "neural_mcts_s50");
    }

    #[test]
    fn new_self_play_enables_dirichlet() {
        let mut node = MctsNode::new(None, 1.0);
        node.children = vec![
            MctsNode::new(Some(Coordinates::from_index(0, 5)), 0.3),
            MctsNode::new(Some(Coordinates::from_index(1, 5)), 0.7),
        ];
        node.children[0].prior = 0.5;
        assert!((node.children[0].prior - 0.5).abs() < 1e-6);
    }

    #[test]
    fn simulation_budgets_use_full_budget_without_losing_remainder() {
        let budgets = NeuralMctsBot::simulation_budgets(10, 4);
        assert_eq!(budgets.iter().sum::<u32>(), 10);
        assert_eq!(budgets.len(), 4);
        let min = budgets.iter().min().copied().unwrap();
        let max = budgets.iter().max().copied().unwrap();
        assert!(max - min <= 1, "budgets are imbalanced: {:?}", budgets);
    }

    #[test]
    fn should_stop_early_requires_minimum_visits_and_confidence() {
        let mut root = MctsNode::new(None, 1.0);
        let mut dominant = MctsNode::new(Some(Coordinates::from_index(0, 5)), 0.7);
        dominant.visits = 70;
        let mut trailing = MctsNode::new(Some(Coordinates::from_index(1, 5)), 0.3);
        trailing.visits = 20;
        root.children = vec![dominant, trailing];

        assert!(NeuralMctsBot::should_stop_early(
            &root,
            EarlyStopConfig {
                visit_ratio: 0.7,
                min_visits: 64,
            }
        ));
        assert!(!NeuralMctsBot::should_stop_early(
            &root,
            EarlyStopConfig {
                visit_ratio: 0.8,
                min_visits: 64,
            }
        ));
        assert!(!NeuralMctsBot::should_stop_early(
            &root,
            EarlyStopConfig {
                visit_ratio: 0.7,
                min_visits: 128,
            }
        ));
    }

    #[test]
    fn build_root_uses_policy_priors_for_available_moves_only() {
        let mut board = GameY::new(3);
        board
            .add_move(Movement::Placement {
                player: PlayerId::new(0),
                coords: Coordinates::from_index(0, 3),
            })
            .unwrap();

        let mut policy = vec![0.0; board.total_cells() as usize];
        policy[0] = 0.95;
        policy[1] = 0.1;
        policy[2] = 0.3;
        policy[3] = 0.6;

        let root = NeuralMctsBot::build_root(&board, &policy);
        let priors_by_index: HashMap<u32, f32> = root
            .children
            .iter()
            .map(|child| (child.action.unwrap().to_index(board.board_size()), child.prior))
            .collect();

        assert!(!priors_by_index.contains_key(&0));
        assert!(priors_by_index[&3] > priors_by_index[&2]);
        assert!(priors_by_index[&2] > priors_by_index[&1]);
        let total: f32 = priors_by_index.values().sum();
        assert!((total - 1.0).abs() < 1e-6);
    }
    #[test]
    fn coordinates_known_values_board_5() {
        let c = Coordinates::from_index(0, 5);
        assert_eq!(c.to_index(5), 0);
        let last = Coordinates::from_index(14, 5);
        assert_eq!(last.to_index(5), 14);
    }

    #[test]
    fn coordinates_roundtrip_triangular_board() {
        for size in [5u32, 7, 9, 11] {
            let total = size * (size + 1) / 2;
            for idx in 0..total {
                let coords = Coordinates::from_index(idx, size);
                assert_eq!(
                    coords.to_index(size), idx,
                    "roundtrip failed for idx={idx} size={size}"
                );
            }
        }
    }
    #[test]
    fn mcts_node_expansion_sets_expanded_flag() {
        let mut node = MctsNode::new(None, 1.0);
        node.expanded = true;
        node.children = vec![
            MctsNode::new(Some(Coordinates::from_index(0, 5)), 0.5),
            MctsNode::new(Some(Coordinates::from_index(1, 5)), 0.5),
        ];
        assert!(node.expanded);
        assert_eq!(node.children.len(), 2);
    }

    #[test]
    fn ucb_score_zero_parent_visits_does_not_nan() {
        let node = MctsNode::new(None, 0.5);
        let score = node.ucb_score(0, std::f32::consts::SQRT_2);
        // sqrt(0) = 0 → exploration = 0, q = 0 → score = 0
        assert_eq!(score, 0.0);
        assert!(!score.is_nan());
    }

    #[test]
    fn ucb_score_high_prior_beats_low_prior_when_unvisited() {
        let high = MctsNode::new(None, 0.9);
        let low  = MctsNode::new(None, 0.1);
        assert!(high.ucb_score(100, 1.0) > low.ucb_score(100, 1.0));
    }

    #[test]
    fn q_value_negative_value_sum() {
        let mut node = MctsNode::new(None, 1.0);
        node.visits = 2;
        node.value_sum = -1.0;
        assert!((node.q_value() - (-0.5)).abs() < 1e-6);
    }

    #[test]
    fn best_child_coords_tie_returns_one_of_them() {
        let mut root = MctsNode::new(None, 1.0);
        let mut c1 = MctsNode::new(Some(Coordinates::from_index(0, 5)), 0.5);
        let mut c2 = MctsNode::new(Some(Coordinates::from_index(1, 5)), 0.5);
        c1.visits = 5;
        c2.visits = 5;
        root.children = vec![c1, c2];
        let best = root.best_child_coords().unwrap();
        assert_eq!(best, Coordinates::from_index(1, 5));
    }

    #[test]
    fn mcts_node_action_none_is_root_convention() {
        let root = MctsNode::new(None, 1.0);
        assert!(root.action.is_none(), "root node should have no action");
    }

    #[test]
    fn mcts_node_debug_format_works() {
        let node = MctsNode::new(Some(Coordinates::from_index(3, 5)), 0.7);
        let s = format!("{:?}", node);
        assert!(s.contains("MctsNode"));
    }
}

//! Bot module for the Game of Y.
//!
//! This module provides the infrastructure for creating and managing AI bots
//! that can play the Game of Y. It includes:
//!
//! - [`YBot`] - A trait that defines the interface for all bots
//! - [`YBotRegistry`] - A registry for managing multiple bot implementations
//! - [`RandomBot`] - A simple bot that makes random valid moves

pub mod balanced_heuristic;
pub mod both_players_set_distances_heuristic;
mod heurisitic;
pub mod minimax;
pub mod neural_mcts;
pub mod neural_net;
pub mod random;
pub(crate) mod set_based_heuristic;
pub mod set_connectivity_heuristic;
pub mod ybot;
pub mod ybot_registry;

pub use balanced_heuristic::*;
pub use neural_mcts::*;
pub use random::*;
pub use ybot::*;
pub use ybot_registry::*;

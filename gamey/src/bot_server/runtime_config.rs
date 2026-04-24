use crate::bot::neural_mcts::EarlyStopConfig;
#[cfg(test)]
use once_cell::sync::Lazy;
use rayon::ThreadPoolBuilder;
use std::sync::Once;
#[cfg(test)]
use std::sync::Mutex;

const DEFAULT_RAYON_THREADS: usize = 4;
const DEFAULT_EXPERT_FAST_SIMULATIONS: u32 = 200;
const DEFAULT_EXPERT_SIMULATIONS: u32 = 256;
const DEFAULT_EXPERT_FAST_EARLY_STOP_RATIO: f32 = 0.68;
const DEFAULT_EXPERT_FAST_EARLY_STOP_MIN_VISITS: u32 = 48;
const DEFAULT_EXPERT_EARLY_STOP_RATIO: f32 = 0.62;
const DEFAULT_EXPERT_EARLY_STOP_MIN_VISITS: u32 = 96;

static RAYON_INIT: Once = Once::new();
#[cfg(test)]
pub(crate) static ENV_GUARD: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NeuralBotRuntimeConfig {
    pub simulations: u32,
    pub early_stop: EarlyStopConfig,
}

impl NeuralBotRuntimeConfig {
    pub fn bot_id(self) -> String {
        format!("neural_mcts_s{}", self.simulations)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BotServerRuntimeConfig {
    pub rayon_threads: usize,
    pub expert_fast: NeuralBotRuntimeConfig,
    pub expert: NeuralBotRuntimeConfig,
}

impl BotServerRuntimeConfig {
    pub fn from_env() -> Self {
        Self {
            rayon_threads: read_env_usize("GAMEY_RAYON_THREADS", DEFAULT_RAYON_THREADS),
            expert_fast: NeuralBotRuntimeConfig {
                simulations: read_env_u32("GAMEY_EXPERT_FAST_SIMULATIONS", DEFAULT_EXPERT_FAST_SIMULATIONS),
                early_stop: EarlyStopConfig {
                    visit_ratio: read_env_f32(
                        "GAMEY_EXPERT_FAST_EARLY_STOP_RATIO",
                        DEFAULT_EXPERT_FAST_EARLY_STOP_RATIO,
                    ),
                    min_visits: read_env_u32(
                        "GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS",
                        DEFAULT_EXPERT_FAST_EARLY_STOP_MIN_VISITS,
                    ),
                },
            },
            expert: NeuralBotRuntimeConfig {
                simulations: read_env_u32("GAMEY_EXPERT_SIMULATIONS", DEFAULT_EXPERT_SIMULATIONS),
                early_stop: EarlyStopConfig {
                    visit_ratio: read_env_f32("GAMEY_EXPERT_EARLY_STOP_RATIO", DEFAULT_EXPERT_EARLY_STOP_RATIO),
                    min_visits: read_env_u32(
                        "GAMEY_EXPERT_EARLY_STOP_MIN_VISITS",
                        DEFAULT_EXPERT_EARLY_STOP_MIN_VISITS,
                    ),
                },
            },
        }
    }
}

pub fn init_rayon_pool(threads: usize) {
    let thread_count = threads.max(1);
    RAYON_INIT.call_once(|| {
        ThreadPoolBuilder::new()
            .num_threads(thread_count)
            .build_global()
            .expect("failed to initialize global rayon thread pool");
    });
}

fn read_env_u32(name: &str, default: u32) -> u32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn read_env_f32(name: &str, default: f32) -> f32 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_config_uses_defaults_when_env_is_missing() {
        let _guard = ENV_GUARD.lock().unwrap();
        for key in [
            "GAMEY_RAYON_THREADS",
            "GAMEY_EXPERT_FAST_SIMULATIONS",
            "GAMEY_EXPERT_SIMULATIONS",
            "GAMEY_EXPERT_FAST_EARLY_STOP_RATIO",
            "GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS",
            "GAMEY_EXPERT_EARLY_STOP_RATIO",
            "GAMEY_EXPERT_EARLY_STOP_MIN_VISITS",
        ] {
            unsafe { std::env::remove_var(key) };
        }

        let config = BotServerRuntimeConfig::from_env();
        assert_eq!(config.rayon_threads, DEFAULT_RAYON_THREADS);
        assert_eq!(config.expert_fast.simulations, DEFAULT_EXPERT_FAST_SIMULATIONS);
        assert_eq!(config.expert.simulations, DEFAULT_EXPERT_SIMULATIONS);
        assert_eq!(
            config.expert_fast.early_stop,
            EarlyStopConfig {
                visit_ratio: DEFAULT_EXPERT_FAST_EARLY_STOP_RATIO,
                min_visits: DEFAULT_EXPERT_FAST_EARLY_STOP_MIN_VISITS,
            }
        );
        assert_eq!(
            config.expert.early_stop,
            EarlyStopConfig {
                visit_ratio: DEFAULT_EXPERT_EARLY_STOP_RATIO,
                min_visits: DEFAULT_EXPERT_EARLY_STOP_MIN_VISITS,
            }
        );
    }

    #[test]
    fn runtime_config_reads_valid_env_overrides() {
        let _guard = ENV_GUARD.lock().unwrap();
        unsafe {
            std::env::set_var("GAMEY_RAYON_THREADS", "8");
            std::env::set_var("GAMEY_EXPERT_FAST_SIMULATIONS", "160");
            std::env::set_var("GAMEY_EXPERT_SIMULATIONS", "320");
            std::env::set_var("GAMEY_EXPERT_FAST_EARLY_STOP_RATIO", "0.6");
            std::env::set_var("GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS", "24");
            std::env::set_var("GAMEY_EXPERT_EARLY_STOP_RATIO", "0.65");
            std::env::set_var("GAMEY_EXPERT_EARLY_STOP_MIN_VISITS", "96");
        }

        let config = BotServerRuntimeConfig::from_env();
        assert_eq!(config.rayon_threads, 8);
        assert_eq!(config.expert_fast.simulations, 160);
        assert_eq!(config.expert.simulations, 320);
        assert_eq!(
            config.expert_fast.early_stop,
            EarlyStopConfig {
                visit_ratio: 0.6,
                min_visits: 24,
            }
        );
        assert_eq!(
            config.expert.early_stop,
            EarlyStopConfig {
                visit_ratio: 0.65,
                min_visits: 96,
            }
        );

        unsafe {
            std::env::remove_var("GAMEY_RAYON_THREADS");
            std::env::remove_var("GAMEY_EXPERT_FAST_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_SIMULATIONS");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_RATIO");
            std::env::remove_var("GAMEY_EXPERT_EARLY_STOP_MIN_VISITS");
        }
    }
}

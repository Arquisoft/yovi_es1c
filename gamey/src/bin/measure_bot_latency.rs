use clap::Parser;
use gamey::bot_server::create_default_state;
use gamey::{Coordinates, GameY, Movement};
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::Serialize;
use std::time::Instant;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long, default_value = "expert")]
    bot: String,

    #[arg(long, default_value_t = 128)]
    positions: usize,

    #[arg(long, default_value_t = 16)]
    warmup: usize,

    #[arg(long, value_delimiter = ',', default_values_t = [5_u32, 7, 9, 11])]
    board_sizes: Vec<u32>,

    #[arg(long, default_value_t = 42)]
    seed: u64,
}

#[derive(Serialize)]
struct LatencyReport {
    bot: String,
    samples: usize,
    board_sizes: Vec<u32>,
    min_ms: f64,
    p50_ms: f64,
    p95_ms: f64,
    max_ms: f64,
    mean_ms: f64,
}

fn main() {
    let args = Args::parse();
    let state = create_default_state();
    let resolved_id = state.resolve_bot_id(&args.bot).to_string();
    let bot = state
        .bots()
        .find(&resolved_id)
        .unwrap_or_else(|| panic!("bot '{}' resolved to '{}' but was not found", args.bot, resolved_id));

    let positions = build_positions(&args.board_sizes, args.positions, args.seed);
    assert!(
        !positions.is_empty(),
        "measurement requires at least one generated position"
    );

    for board in positions.iter().cycle().take(args.warmup) {
        let _ = bot.choose_move(board);
    }

    let mut samples_ms = Vec::with_capacity(positions.len());
    for board in &positions {
        let start = Instant::now();
        let _ = bot.choose_move(board);
        samples_ms.push(start.elapsed().as_secs_f64() * 1000.0);
    }

    let report = LatencyReport {
        bot: args.bot,
        samples: samples_ms.len(),
        board_sizes: args.board_sizes,
        min_ms: percentile(&samples_ms, 0.0),
        p50_ms: percentile(&samples_ms, 0.50),
        p95_ms: percentile(&samples_ms, 0.95),
        max_ms: percentile(&samples_ms, 1.0),
        mean_ms: samples_ms.iter().sum::<f64>() / samples_ms.len() as f64,
    };

    println!("{}", serde_json::to_string_pretty(&report).expect("serialize latency report"));
}

fn percentile(values: &[f64], quantile: f64) -> f64 {
    assert!(!values.is_empty(), "percentile requires at least one value");
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).expect("latency values are finite"));
    let max_index = sorted.len() - 1;
    let index = ((max_index as f64) * quantile).round() as usize;
    sorted[index.min(max_index)]
}

fn build_positions(board_sizes: &[u32], total: usize, seed: u64) -> Vec<GameY> {
    let mut rng = StdRng::seed_from_u64(seed);
    let mut positions = Vec::with_capacity(total);

    for index in 0..total {
        let size = board_sizes[index % board_sizes.len()];
        positions.push(random_midgame_position(size, &mut rng));
    }

    positions
}

fn random_midgame_position(size: u32, rng: &mut StdRng) -> GameY {
    let mut board = GameY::new(size);
    let total_cells = board.total_cells();
    let target_moves = target_move_count(size, total_cells, rng);

    for _ in 0..target_moves {
        if board.check_game_over() {
            break;
        }

        let available = board.available_cells();
        if available.len() <= 1 {
            break;
        }

        let choice = rng.random_range(0..available.len());
        let coords = Coordinates::from_index(available[choice], size);
        let player = board.next_player().expect("midgame positions require an active player");
        board
            .add_move(Movement::Placement { player, coords })
            .expect("generated moves must be valid");
    }

    board
}

fn target_move_count(size: u32, total_cells: u32, rng: &mut StdRng) -> u32 {
    let lower = (size / 2).max(2);
    let upper = (total_cells.saturating_sub(2)).max(lower + 1);
    rng.random_range(lower..upper)
}

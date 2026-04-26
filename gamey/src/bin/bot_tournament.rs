use clap::{Parser, ValueEnum};
use gamey::bot_server::create_default_state;
use gamey::{GameY, PlayerId, YBot};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    Table,
    Json,
}

#[derive(Parser, Debug)]
#[command(
    name = "bot_tournament",
    about = "Run a round-robin tournament between GameY bots"
)]
struct Args {
    #[arg(long, default_value_t = 8)]
    board_size: u32,

    #[arg(long, default_value_t = 2)]
    games_per_pair: usize,

    #[arg(long, value_delimiter = ',', default_value = "easy,medium,hard,impossible")]
    bots: Vec<String>,

    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    output: OutputFormat,
}

#[derive(Clone)]
struct BotEntry {
    alias: String,
    resolved_id: String,
    bot: Arc<dyn YBot>,
}

#[derive(Clone, Debug, Default, Serialize)]
struct BotStats {
    bot: String,
    resolved_id: String,
    played: usize,
    wins: usize,
    losses: usize,
    draws: usize,
    forfeits: usize,
}

impl BotStats {
    fn score(&self) -> f64 {
        self.wins as f64 + (self.draws as f64 * 0.5)
    }

    fn win_rate(&self) -> f64 {
        if self.played == 0 {
            0.0
        } else {
            (self.wins as f64 / self.played as f64) * 100.0
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct MatchResult {
    player0: String,
    player1: String,
    winner: Option<String>,
    plies: usize,
    forfeit_by: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
struct TournamentReport {
    board_size: u32,
    games_per_pair: usize,
    standings: Vec<BotStats>,
    matches: Vec<MatchResult>,
}

fn main() {
    let args = Args::parse();
    assert!(args.board_size > 0, "board size must be positive");
    assert!(args.games_per_pair > 0, "games per pair must be positive");

    let state = create_default_state();
    let registry = state.bots();
    let mut entries = Vec::new();

    for alias in dedupe(args.bots) {
        let resolved_id = state.resolve_bot_id(&alias).to_string();
        let bot = registry
            .find(&resolved_id)
            .unwrap_or_else(|| panic!("bot alias '{alias}' resolved to '{resolved_id}', but no bot with that id is registered"));
        entries.push(BotEntry { alias, resolved_id, bot });
    }

    assert!(entries.len() >= 2, "at least two bots are required");

    let report = run_tournament(args.board_size, args.games_per_pair, &entries);

    match args.output {
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("serialize tournament report")
            );
        }
        OutputFormat::Table => print_table(&report),
    }
}

fn dedupe(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let normalized = value.trim().to_lowercase();
        if !normalized.is_empty() && seen.insert(normalized.clone()) {
            result.push(normalized);
        }
    }
    result
}

fn run_tournament(board_size: u32, games_per_pair: usize, entries: &[BotEntry]) -> TournamentReport {
    let mut stats: HashMap<String, BotStats> = entries
        .iter()
        .map(|entry| {
            (
                entry.alias.clone(),
                BotStats {
                    bot: entry.alias.clone(),
                    resolved_id: entry.resolved_id.clone(),
                    ..BotStats::default()
                },
            )
        })
        .collect();
    let mut matches = Vec::new();

    for left in 0..entries.len() {
        for right in (left + 1)..entries.len() {
            for game_idx in 0..games_per_pair {
                let (player0, player1) = if game_idx % 2 == 0 {
                    (left, right)
                } else {
                    (right, left)
                };
                let result = play_game(board_size, entries, player0, player1);
                update_stats(&mut stats, &result);
                matches.push(result);
            }
        }
    }

    let mut standings = stats.into_values().collect::<Vec<_>>();
    standings.sort_by(|left, right| {
        right
            .score()
            .partial_cmp(&left.score())
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(right.wins.cmp(&left.wins))
            .then(left.losses.cmp(&right.losses))
            .then(left.bot.cmp(&right.bot))
    });

    TournamentReport {
        board_size,
        games_per_pair,
        standings,
        matches,
    }
}

fn play_game(
    board_size: u32,
    entries: &[BotEntry],
    player0_idx: usize,
    player1_idx: usize,
) -> MatchResult {
    let mut game = GameY::new(board_size);
    let max_plies = (game.total_cells() as usize).saturating_mul(2).max(1);
    let player0 = entries[player0_idx].alias.clone();
    let player1 = entries[player1_idx].alias.clone();

    for plies in 0..max_plies {
        let Some(next_player) = game.next_player() else {
            return MatchResult {
                player0,
                player1,
                winner: game.winner().map(|winner| winner_alias(winner, &entries[player0_idx], &entries[player1_idx])),
                plies,
                forfeit_by: None,
            };
        };

        if game.available_cells().is_empty() {
            return MatchResult {
                player0,
                player1,
                winner: None,
                plies,
                forfeit_by: None,
            };
        }

        let current_idx = if next_player.id() == 0 { player0_idx } else { player1_idx };
        let opponent_idx = if current_idx == player0_idx { player1_idx } else { player0_idx };
        let Some(coords) = entries[current_idx].bot.choose_move(&game) else {
            return MatchResult {
                player0,
                player1,
                winner: Some(entries[opponent_idx].alias.clone()),
                plies,
                forfeit_by: Some(entries[current_idx].alias.clone()),
            };
        };

        if game.play_coords(coords).is_err() {
            return MatchResult {
                player0,
                player1,
                winner: Some(entries[opponent_idx].alias.clone()),
                plies,
                forfeit_by: Some(entries[current_idx].alias.clone()),
            };
        }
    }

    MatchResult {
        player0,
        player1,
        winner: game.winner().map(|winner| winner_alias(winner, &entries[player0_idx], &entries[player1_idx])),
        plies: max_plies,
        forfeit_by: None,
    }
}

fn winner_alias(winner: PlayerId, player0: &BotEntry, player1: &BotEntry) -> String {
    if winner.id() == 0 {
        player0.alias.clone()
    } else {
        player1.alias.clone()
    }
}

fn update_stats(stats: &mut HashMap<String, BotStats>, result: &MatchResult) {
    for bot in [&result.player0, &result.player1] {
        stats.get_mut(bot).expect("stats entry exists").played += 1;
    }

    match &result.winner {
        Some(winner) => {
            let loser = if winner == &result.player0 {
                &result.player1
            } else {
                &result.player0
            };
            stats.get_mut(winner).expect("winner stats exist").wins += 1;
            stats.get_mut(loser).expect("loser stats exist").losses += 1;
        }
        None => {
            stats.get_mut(&result.player0).expect("player0 stats exist").draws += 1;
            stats.get_mut(&result.player1).expect("player1 stats exist").draws += 1;
        }
    }

    if let Some(forfeit_by) = &result.forfeit_by {
        stats.get_mut(forfeit_by).expect("forfeit stats exist").forfeits += 1;
    }
}

fn print_table(report: &TournamentReport) {
    println!(
        "Bot tournament | board_size={} | games_per_pair={} | matches={}",
        report.board_size,
        report.games_per_pair,
        report.matches.len()
    );
    println!("{:<14} {:<24} {:>6} {:>6} {:>6} {:>6} {:>8} {:>8}", "bot", "resolved_id", "played", "wins", "losses", "draws", "score", "winrate");
    println!("{}", "-".repeat(92));

    for row in &report.standings {
        println!(
            "{:<14} {:<24} {:>6} {:>6} {:>6} {:>6} {:>8.1} {:>7.1}%",
            row.bot,
            row.resolved_id,
            row.played,
            row.wins,
            row.losses,
            row.draws,
            row.score(),
            row.win_rate(),
        );
    }
}

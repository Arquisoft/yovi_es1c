use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use gamey::neural_net::NeuralNet;
use gamey::{Coordinates, GameY, Movement, NeuralMctsBot, PlayerId, RenderOptions, YBot};
use std::path::Path;
use std::sync::Arc;

/// Benchmarks for coordinate conversion functions
fn bench_coordinates(c: &mut Criterion) {
    let mut group = c.benchmark_group("coordinates");

    for board_size in [5, 10, 15, 20].iter() {
        let total_cells = (board_size * (board_size + 1)) / 2;

        group.bench_with_input(
            BenchmarkId::new("from_index", board_size),
            board_size,
            |b, &size| {
                b.iter(|| {
                    for idx in 0..total_cells {
                        black_box(Coordinates::from_index(idx, size));
                    }
                })
            },
        );

        group.bench_with_input(
            BenchmarkId::new("to_index", board_size),
            board_size,
            |b, &size| {
                let coords: Vec<_> = (0..total_cells)
                    .map(|idx| Coordinates::from_index(idx, size))
                    .collect();
                b.iter(|| {
                    for coord in &coords {
                        black_box(coord.to_index(size));
                    }
                })
            },
        );

        group.bench_with_input(
            BenchmarkId::new("roundtrip", board_size),
            board_size,
            |b, &size| {
                b.iter(|| {
                    for idx in 0..total_cells {
                        let coords = Coordinates::from_index(idx, size);
                        black_box(coords.to_index(size));
                    }
                })
            },
        );
    }

    group.finish();
}

/// Benchmarks for game creation
fn bench_game_creation(c: &mut Criterion) {
    let mut group = c.benchmark_group("game_creation");

    for board_size in [5, 10, 15, 20].iter() {
        group.bench_with_input(
            BenchmarkId::new("new", board_size),
            board_size,
            |b, &size| {
                b.iter(|| black_box(GameY::new(size)))
            },
        );
    }

    group.finish();
}

/// Benchmarks for adding moves to the game
fn bench_add_move(c: &mut Criterion) {
    let mut group = c.benchmark_group("add_move");

    for board_size in [5, 10, 15].iter() {
        let total_cells = (board_size * (board_size + 1)) / 2;

        // Benchmark adding a single move to an empty board
        group.bench_with_input(
            BenchmarkId::new("single_move", board_size),
            board_size,
            |b, &size| {
                b.iter_batched(
                    || GameY::new(size),
                    |mut game| {
                        let coords = Coordinates::from_index(0, size);
                        let movement = Movement::Placement {
                            player: PlayerId::new(0),
                            coords,
                        };
                        let _ = black_box(game.add_move(movement));
                        game
                    },
                    criterion::BatchSize::SmallInput,
                )
            },
        );

        // Benchmark filling half the board
        group.bench_with_input(
            BenchmarkId::new("half_board", board_size),
            board_size,
            |b, &size| {
                b.iter_batched(
                    || GameY::new(size),
                    |mut game| {
                        let half = total_cells / 2;
                        for idx in 0..half {
                            let coords = Coordinates::from_index(idx, size);
                            let player = PlayerId::new(idx % 2);
                            let movement = Movement::Placement { player, coords };
                            let _ = game.add_move(movement);
                        }
                        black_box(game)
                    },
                    criterion::BatchSize::SmallInput,
                )
            },
        );
    }

    group.finish();
}

/// Benchmarks for board rendering
fn bench_render(c: &mut Criterion) {
    let mut group = c.benchmark_group("render");

    let options_simple = RenderOptions {
        show_3d_coords: false,
        show_idx: false,
        show_colors: false,
    };

    let options_full = RenderOptions {
        show_3d_coords: true,
        show_idx: true,
        show_colors: true,
    };

    for board_size in [5, 10, 15].iter() {
        // Create a game with some moves
        let mut game = GameY::new(*board_size);
        let total_cells = (board_size * (board_size + 1)) / 2;
        for idx in 0..(total_cells / 3) {
            let coords = Coordinates::from_index(idx, *board_size);
            let player = PlayerId::new(idx % 2);
            let movement = Movement::Placement { player, coords };
            let _ = game.add_move(movement);
        }

        group.bench_with_input(
            BenchmarkId::new("simple", board_size),
            &game,
            |b, game| {
                b.iter(|| black_box(game.render(&options_simple)))
            },
        );

        group.bench_with_input(
            BenchmarkId::new("full_options", board_size),
            &game,
            |b, game| {
                b.iter(|| black_box(game.render(&options_full)))
            },
        );
    }

    group.finish();
}

/// Benchmarks for checking side touches
fn bench_touches_side(c: &mut Criterion) {
    let mut group = c.benchmark_group("touches_side");

    for board_size in [10, 20].iter() {
        let total_cells = (board_size * (board_size + 1)) / 2;
        let coords: Vec<_> = (0..total_cells)
            .map(|idx| Coordinates::from_index(idx, *board_size))
            .collect();

        group.bench_with_input(
            BenchmarkId::new("all_sides", board_size),
            &coords,
            |b, coords| {
                b.iter(|| {
                    for coord in coords {
                        black_box(coord.touches_side_a());
                        black_box(coord.touches_side_b());
                        black_box(coord.touches_side_c());
                    }
                })
            },
        );
    }

    group.finish();
}

fn bench_neural_evaluate(c: &mut Criterion) {
    let Some((net, boards)) = load_neural_benchmark_fixture() else {
        return;
    };

    let hot_board = &boards[0];
    let _ = net.evaluate(hot_board);
    let mut group = c.benchmark_group("neural_evaluate");

    group.bench_function("cache_hit", |b| {
        b.iter(|| black_box(net.evaluate(hot_board).expect("evaluate cache hit")))
    });

    group.bench_function("cache_miss", |b| {
        let mut index = 0usize;
        b.iter(|| {
            net.clear_cache().expect("clear cache before miss benchmark");
            let board = &boards[index % boards.len()];
            index += 1;
            black_box(net.evaluate(board).expect("evaluate cache miss"))
        })
    });

    group.finish();
}

fn bench_neural_evaluate_batch(c: &mut Criterion) {
    let Some((net, boards)) = load_neural_benchmark_fixture() else {
        return;
    };

    let hot_batch = vec![&boards[0], &boards[1], &boards[2], &boards[3]];
    let _ = net.evaluate_batch(&hot_batch);
    let mut group = c.benchmark_group("neural_evaluate_batch");

    group.bench_function("cache_hit", |b| {
        b.iter(|| black_box(net.evaluate_batch(black_box(&hot_batch))))
    });

    group.bench_function("cache_miss", |b| {
        let mut index = 0usize;
        b.iter(|| {
            net.clear_cache().expect("clear cache before batch miss benchmark");
            let batch: Vec<&GameY> = (0..4)
                .map(|offset| &boards[(index + offset) % boards.len()])
                .collect();
            index = (index + 4) % boards.len();
            black_box(net.evaluate_batch(black_box(&batch)))
        })
    });

    group.finish();
}

fn bench_neural_choose_move(c: &mut Criterion) {
    let Some((net, boards)) = load_neural_benchmark_fixture() else {
        return;
    };

    let hot_board = &boards[0];
    let bot = NeuralMctsBot::new(net, 64);
    let mut group = c.benchmark_group("neural_choose_move");

    group.bench_function("mcts_64", |b| {
        b.iter(|| black_box(bot.choose_move(hot_board)))
    });

    group.finish();
}

fn neural_benchmark_boards() -> Vec<GameY> {
    vec![
        build_neural_board(5, &[0, 1, 3, 6]),
        build_neural_board(5, &[0, 2, 4]),
        build_neural_board(7, &[0, 1, 3, 6, 7]),
        build_neural_board(7, &[0, 2, 5, 8, 11, 12]),
        build_neural_board(8, &[0, 1, 3, 6, 10, 15]),
        build_neural_board(8, &[0, 2, 5, 9, 14, 20]),
        build_neural_board(9, &[0, 1, 3, 6, 10, 15, 21]),
        build_neural_board(9, &[0, 2, 5, 9, 14, 20, 27]),
    ]
}

fn build_neural_board(size: u32, placements: &[u32]) -> GameY {
    let mut board = GameY::new(size);
    for &idx in placements {
        let coords = Coordinates::from_index(idx, size);
        let player = board.next_player().unwrap();
        board.add_move(Movement::Placement { player, coords }).unwrap();
    }
    board
}

fn load_neural_benchmark_fixture() -> Option<(Arc<NeuralNet>, Vec<GameY>)> {
    let model_path = Path::new("models").join("yovi_model.onnx");
    if !model_path.exists() {
        return None;
    }

    let model_path = model_path.to_str().expect("valid model path");
    let net = match NeuralNet::load(model_path) {
        Ok(net) => net,
        Err(error) => {
            eprintln!("Skipping neural benchmarks: failed to load {model_path}: {error}");
            return None;
        }
    };

    Some((net, neural_benchmark_boards()))
}

criterion_group!(
    benches,
    bench_coordinates,
    bench_game_creation,
    bench_add_move,
    bench_render,
    bench_touches_side,
    bench_neural_evaluate,
    bench_neural_evaluate_batch,
    bench_neural_choose_move,
);

criterion_main!(benches);

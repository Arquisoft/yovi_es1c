# Gamey

Rust implementation of the Game Y engine, CLI and HTTP bot server.

## Responsibilities

- Implement Game Y board state, coordinates, movement, rules and win detection.
- Support YEN/YGN-style notation used by the frontend and Game Service.
- Run an interactive CLI game in human-vs-human mode.
- Run human-vs-bot mode from the CLI.
- Run an Axum HTTP server for bot move selection.
- Provide heuristic bots and neural MCTS bots backed by `models/yovi_model.onnx`.
- Export Prometheus metrics for bot latency and inference latency.

## Runtime Modes

```bash
# Human vs human CLI, board size 7 by default
cargo run

# Human vs bot
cargo run -- --mode computer --bot medium

# HTTP bot server
cargo run -- --mode server --port 4000
```

Useful CLI flags:

- `--size <n>`: triangular board side length, default `7`.
- `--mode human|computer|server`: runtime mode.
- `--bot <id>`: bot for computer mode, default `random`.
- `--port <port>`: server port, default `3000` outside Docker.
- `--honey`: enable Honey blocked cells.
- `--honey-cells row,col row,col`: explicit blocked cells for Honey mode.

The Docker image runs server mode on port `4000`.

## HTTP Endpoints

When running in server mode:

| Method | Path | Description |
|---|---|---|
| `GET` | `/status` | Health check returning `OK`. |
| `GET` | `/metrics` | Prometheus metrics. |
| `POST` | `/{api_version}/ybot/choose/{bot_id}` | Return a bot move for a serialized YEN board. |
| `POST` | `/{api_version}/ybot/play` | Play endpoint used by clients/services. |
| `GET` | `/play` | Competition-style play endpoint. |

Through Nginx, these are available under `/api/gamey/*`, except `/play` which is also proxied as `/play`.

## Bot Aliases

The default server state registers aliases:

| Alias | Bot |
|---|---|
| `easy` | Neural MCTS with configurable simulation count. |
| `easy_fast` | Neural MCTS with configurable fast simulation count. |
| `medium` | Minimax using the opposing-set heuristic at depth 3. |
| `hard` | Minimax using the connectivity heuristic at depth 4. |
| `impossible` | Monte Carlo bot. |
| `expert_fast` | Deprecated compatibility alias for `easy_fast`. |
| `expert` | Deprecated compatibility alias for `easy`. |

The neural bots require `models/yovi_model.onnx`. The repository currently includes the trained `.pt`, `.onnx` and `.onnx.data` model artifacts.

## Environment Variables

| Variable | Default in Compose | Description |
|---|---|---|
| `GAMEY_RAYON_THREADS` | `4` | Rayon worker threads for bot search. |
| `GAMEY_EXPERT_FAST_SIMULATIONS` | `200` | Simulations for `easy_fast` (legacy env name). |
| `GAMEY_EXPERT_FAST_EARLY_STOP_RATIO` | `0.68` | Early-stop visit ratio for `easy_fast` (legacy env name). |
| `GAMEY_EXPERT_FAST_EARLY_STOP_MIN_VISITS` | `48` | Minimum visits before early stop for `easy_fast` (legacy env name). |
| `GAMEY_EXPERT_SIMULATIONS` | `256` | Simulations for `easy` (legacy env name). |
| `GAMEY_EXPERT_EARLY_STOP_RATIO` | `0.62` | Early-stop visit ratio for `easy` (legacy env name). |
| `GAMEY_EXPERT_EARLY_STOP_MIN_VISITS` | `96` | Minimum visits before early stop for `easy` (legacy env name). |

## Build and Test

```bash
cargo build
cargo build --release
cargo test
cargo bench
cargo doc --open
```

## Fuzz Testing

The repository includes fuzz targets for notation and coordinates. With nightly Rust and cargo-fuzz:

```bash
cargo install cargo-fuzz
cargo +nightly fuzz run fuzz_yen_deserialize
cargo +nightly fuzz run fuzz_coordinates
```

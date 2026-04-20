# Load Tests

Performance and load tests for YOVI using:

- **k6** for authenticated REST flows.
- **Artillery** for Socket.IO realtime flows (matchmaking, sessions and timeouts).

These tests are independent from unit/integration tests and are executed manually.

## What is covered

### k6 suites

- `auth.js`: register/login/refresh.
- `game.js`: creates AI/local matches with current match modes and rules:
  - `mode: BOT` (classic rules)
  - `mode: BOT` with `pieRule` + `honey`
  - `mode: LOCAL_2P` with `pieRule`
- `matchmaking.js`: queue join/cancel + polling fallback endpoint using current queue payload (`boardSize` + `rules`).

### Artillery suites

- `online-session.yml`: socket flow (`queue:join` → `matchmaking:matched` → `match:join` → `session:state` + chat).
- `turn-timeout.yml`: timeout trigger flow (`turn:timeout`) over Socket.IO.

## Prerequisites

- Docker + Docker Compose.
- For local mode, main stack running from project root (`docker-compose up -d`).

## Modes

Load tests support two modes via `TARGET_ENV` in `.env`:

- `TARGET_ENV=local` (default): target local stack.
- `TARGET_ENV=remote`: target deployed environment `https://yovi-es1c.duckdns.org`.

### TLS behavior

- `local`: typically uses self-signed certs → keep `K6_INSECURE_TLS=true`.
- `remote`: DuckDNS cert is valid → use `K6_INSECURE_TLS=false`.

## Manual runs (without Docker Compose)

Create `.env` from `.env.example` and set:

- `TARGET_ENV=local` **or** `TARGET_ENV=remote`.
- For `remote`, set `K6_INSECURE_TLS=false`.

Then run:

### k6 (manual)

```bash
# Local mode
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/auth.js
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/game.js
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/matchmaking.js

# Remote mode
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/auth.js
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/game.js
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/matchmaking.js
```

### Artillery (manual)

```bash
# Local mode
TARGET_URL=https://localhost NODE_TLS_REJECT_UNAUTHORIZED=0 artillery run artillery/online-session.yml
TARGET_URL=https://localhost NODE_TLS_REJECT_UNAUTHORIZED=0 artillery run artillery/turn-timeout.yml

# Remote mode
TARGET_URL=https://yovi-es1c.duckdns.org NODE_TLS_REJECT_UNAUTHORIZED=1 artillery run artillery/online-session.yml
TARGET_URL=https://yovi-es1c.duckdns.org NODE_TLS_REJECT_UNAUTHORIZED=1 artillery run artillery/turn-timeout.yml
```

## Docker Compose runs

### Local mode (internal Docker network)

Uses `docker-compose.loadtest.yml` and network `yovi_es1c_monitor-net`:

```bash
docker compose -f docker-compose.loadtest.yml --profile auth up
docker compose -f docker-compose.loadtest.yml --profile game up
docker compose -f docker-compose.loadtest.yml --profile matchmaking up

docker compose -f docker-compose.loadtest.yml --profile online up
docker compose -f docker-compose.loadtest.yml --profile timeout up
```

### Remote mode (public URL, no internal network)

Uses `docker-compose.loadtest.remote.yml` and does **not** connect loadtest containers to `yovi_es1c_monitor-net`:

```bash
docker compose -f docker-compose.loadtest.remote.yml --profile auth up
docker compose -f docker-compose.loadtest.remote.yml --profile game up
docker compose -f docker-compose.loadtest.remote.yml --profile matchmaking up

docker compose -f docker-compose.loadtest.remote.yml --profile online up
docker compose -f docker-compose.loadtest.remote.yml --profile timeout up
```

## Metrics dashboard

k6 writes metrics to Prometheus remote-write. Open Grafana at `http://localhost:9091` and import dashboard **2587** (official k6 dashboard).

> Note: for Docker local mode, do **not** use `localhost` inside containers; use `TARGET_URL_DOCKER=https://nginx`.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `TARGET_ENV` | Target environment (`local` or `remote`) | `local` |
| `TARGET_URL` | Base URL for host/manual runs (outside Docker net) | `https://localhost` |
| `TARGET_URL_DOCKER` | Base URL used by local-mode loadtest containers (inside Docker net) | `https://nginx` |
| `TARGET_URL_REMOTE` | Base URL for remote mode (deployed environment) | `https://yovi-es1c.duckdns.org` |
| `K6_INSECURE_TLS` | Skip TLS verification in k6 | `true` (local), set to `false` for remote |
| `LOADTEST_PASSWORD` | Password used for generated test users | `loadtest_pass_123` |
| `K6_PROMETHEUS_RW_SERVER_URL` | Prometheus remote write endpoint | `http://prometheus:9090/prometheus/api/v1/write` |
| `GAME_SETUP_VUS` | Number of pre-created users in `game.js` setup | `50` |
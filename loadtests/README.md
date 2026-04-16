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
- Main stack running from project root (`docker-compose up -d`).

## Run locally

### k6

```bash
docker-compose -f docker-compose.loadtest.yml --profile auth up
docker-compose -f docker-compose.loadtest.yml --profile game up
docker-compose -f docker-compose.loadtest.yml --profile matchmaking up
```

### Artillery

```bash
docker-compose -f docker-compose.loadtest.yml --profile online up
docker-compose -f docker-compose.loadtest.yml --profile timeout up
```

## Metrics dashboard

k6 writes metrics to Prometheus remote-write. Open Grafana at `http://localhost:9091` and import dashboard **2587** (official k6 dashboard).

> Note: local Nginx commonly uses a self-signed certificate. Keep `K6_INSECURE_TLS=true` for local runs.
> For Docker Compose runs, do **not** use `localhost` as target: use `TARGET_URL_DOCKER=https://nginx`.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `TARGET_URL` | Base URL for host/manual runs (outside Docker net) | `https://localhost` |
| `TARGET_URL_DOCKER` | Base URL used by loadtest containers (inside Docker net) | `https://nginx` |
| `K6_INSECURE_TLS` | Skip TLS verification in k6 (required for local self-signed certs) | `true` |
| `LOADTEST_PASSWORD` | Password used for generated test users | `loadtest_pass_123` |
| `K6_PROMETHEUS_RW_SERVER_URL` | Prometheus remote write endpoint | `http://prometheus:9090/api/v1/write` |
| `GAME_SETUP_VUS` | Number of pre-created users in `game.js` setup | `50` |
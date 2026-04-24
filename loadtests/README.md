
# Load Tests

Manual performance and load tests for YOVI.

## Tooling

- k6 covers authenticated REST flows.
- Artillery covers Socket.IO realtime flows.
- Compose files can run tests against the local Docker network or the deployed DuckDNS environment.

These suites are separate from unit, integration and e2e tests.

## Implemented Suites

### k6

| File | Coverage |
|---|---|
| `k6/auth.js` | Register, login and refresh. |
| `k6/game.js` | Match creation for current BOT and LOCAL_2P flows, including Pie and Honey variants. |
| `k6/matchmaking.js` | Queue join/cancel and polling fallback with `{ boardSize, rules }`. |

### Artillery

| File | Coverage |
|---|---|
| `artillery/online-session.yml` | Remote/valid-TLS online session flow. |
| `artillery/turn-timeout.yml` | Remote/valid-TLS timeout flow. |
| `artillery/online-session.local.yml` | Local self-signed-TLS online session flow. |
| `artillery/turn-timeout.local.yml` | Local self-signed-TLS timeout flow. |
| `artillery/online-session.smoke.local.yml` | Short local matchmaking, session join and chat smoke. |
| `artillery/turn-timeout.smoke.local.yml` | Short local timeout smoke. |

`artillery/helpers.js` contains shared HTTPS/auth helpers and has its own Node test file.

## Environment

Create a local `.env` from `.env.example`.

| Variable | Default | Description |
|---|---|---|
| `TARGET_ENV` | `local` | `local` or `remote`. |
| `TARGET_URL` | `https://localhost` | Manual host URL outside Docker. |
| `TARGET_URL_DOCKER` | `https://nginx` | Local Docker-network URL. |
| `TARGET_URL_REMOTE` | `https://yovi-es1c.duckdns.org` | Remote deployment URL. |
| `K6_INSECURE_TLS` | `true` | Skip TLS verification in k6. Set `false` for remote valid certs. |
| `K6_PROMETHEUS_RW_SERVER_URL` | `http://prometheus:9090/prometheus/api/v1/write` | Local Prometheus remote-write endpoint. |
| `K6_PROMETHEUS_RW_SERVER_URL_REMOTE` | `https://yovi-es1c.duckdns.org/prometheus/api/v1/write` | Remote Prometheus remote-write endpoint. |
| `LOADTEST_USERNAME` | `loadtest_user` | Base username for generated users. |
| `LOADTEST_PASSWORD` | `loadtest_pass_123` | Password for generated users. |
| `GAME_SETUP_VUS` | `50` | Number of users pre-created by `game.js` setup. |

## Prerequisites

- Docker and Docker Compose for Compose-based runs.
- Local stack running for local tests:

```bash
docker compose up -d
```

- k6 installed for manual k6 runs.
- Artillery installed for manual Artillery runs.

## Manual k6 Runs

Local:

```bash
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/auth.js
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/game.js
TARGET_ENV=local TARGET_URL=https://localhost k6 run k6/matchmaking.js
```

Remote:

```bash
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/auth.js
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/game.js
TARGET_ENV=remote TARGET_URL_REMOTE=https://yovi-es1c.duckdns.org K6_INSECURE_TLS=false k6 run k6/matchmaking.js
```

## Manual Artillery Runs

Local:

```bash
TARGET_URL=https://localhost LOADTEST_INSECURE_TLS=true artillery run artillery/online-session.local.yml
TARGET_URL=https://localhost LOADTEST_INSECURE_TLS=true artillery run artillery/turn-timeout.local.yml
TARGET_URL=https://localhost LOADTEST_INSECURE_TLS=true artillery run artillery/online-session.smoke.local.yml
TARGET_URL=https://localhost LOADTEST_INSECURE_TLS=true artillery run artillery/turn-timeout.smoke.local.yml
```

Remote:

```bash
TARGET_URL=https://yovi-es1c.duckdns.org artillery run artillery/online-session.yml
TARGET_URL=https://yovi-es1c.duckdns.org artillery run artillery/turn-timeout.yml
```

## Docker Compose Runs

Run from `loadtests/`.

Local Docker network:

```bash
docker compose -f docker-compose.loadtest.yml --profile auth up
docker compose -f docker-compose.loadtest.yml --profile game up
docker compose -f docker-compose.loadtest.yml --profile matchmaking up
docker compose -f docker-compose.loadtest.yml --profile online up
docker compose -f docker-compose.loadtest.yml --profile timeout up
```

Remote public URL:

```bash
docker compose -f docker-compose.loadtest.remote.yml --profile auth up
docker compose -f docker-compose.loadtest.remote.yml --profile game up
docker compose -f docker-compose.loadtest.remote.yml --profile matchmaking up
docker compose -f docker-compose.loadtest.remote.yml --profile online up
docker compose -f docker-compose.loadtest.remote.yml --profile timeout up
```

## Metrics

k6 writes metrics to Prometheus remote-write. In the local Compose stack, open Grafana at `http://localhost:9091` or `https://localhost/grafana/` and import dashboard `2587` for the official k6 dashboard.

Inside local load-test containers, use `TARGET_URL_DOCKER=https://nginx`; do not use `localhost` from inside a container.

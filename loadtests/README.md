# Load Tests

Performance and load tests for the YOVI platform, using **k6** (REST endpoints)
and **Artillery** (Socket.IO real-time sessions).

These tests are completely independent from the unit and integration test suites.
They do not run automatically on push or PR — they must be triggered manually.

## Prerequisites

- Docker and Docker Compose installed
- The main stack running (`docker-compose up -d` from the project root)

## Running locally

### k6 — REST endpoints

```bash
# Auth flows (login, register, refresh)
docker-compose -f docker-compose.loadtest.yml --profile auth up

# AI match flows (create match, move, stats)
docker-compose -f docker-compose.loadtest.yml --profile game up

# Matchmaking queue flows
docker-compose -f docker-compose.loadtest.yml --profile matchmaking up
```

### Artillery — Socket.IO sessions

```bash
# Online session full turn cycle
docker-compose -f docker-compose.loadtest.yml --profile online up

# Turn timeout + bot fallback simulation
docker-compose -f docker-compose.loadtest.yml --profile timeout up
```

## Viewing results in Grafana

k6 sends metrics to the existing Prometheus instance automatically.
Open Grafana at `http://localhost:9091` and import dashboard ID **2587**
(official k6 Grafana dashboard) to visualise results in real time.

## Running from GitHub Actions

Go to **Actions → Load Tests (manual only) → Run workflow**.
Select the test suite and provide the target URL of the deployed app.
This workflow never runs automatically.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `TARGET_URL` | Base URL of the app under test | `http://localhost` |
| `K6_PROMETHEUS_RW_SERVER_URL` | Prometheus remote write endpoint | `http://prometheus:9090/api/v1/write` |
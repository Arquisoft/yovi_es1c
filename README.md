## You can find our project deployed here: [https://yovi-es1c.duckdns.org/](https://yovi-es1c.duckdns.org/)

# Yovi_es1c - Game Y at UniOvi

[![Release — Test, Build, Publish, Deploy](https://github.com/arquisoft/yovi_es1c/actions/workflows/release-deploy.yml/badge.svg)](https://github.com/arquisoft/yovi_es1c/actions/workflows/release-deploy.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_es1c&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_es1c)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_es1c&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_es1c)
[![CodeScene Average Code Health](https://codescene.io/projects/76242/status-badges/average-code-health)](https://codescene.io/projects/76242)

YOVI is a web platform for playing the game Y, developed for UniOvi as part of the ASW course.

## Contributors

- UO302313 - David Fernando Bolaños Lopez
- UO294946 - Raúl Velasco Vizán
- UO301919 - Ángela Nistal Guerrero
- UO300731 - Olai Navarro Baizán
- UO301831 - Alejandro Requena Roncero

## Project Structure

The project is divided into the following components, each in its own directory:

- `webapp/`: Frontend single-page application built with React, Vite, and TypeScript.
- `users/`: Backend service for user profile management, built with Node.js, Express, and TypeScript.
- `auth/`: Authentication service (Node.js + Express + TypeScript). Handles registration, login, token refresh, and internal JWT verification.
- `gamey/`: Y game engine and bot server implemented in Rust.
- `gameservice/`: Online game service (Node.js + Express + TypeScript). Manages match persistence, statistics, online matchmaking, and real-time sessions via Socket.IO with Redis.
- `nginx/`: API Gateway configuration (reverse proxy, rate limiting, CORS, SPA fallback).
- `docs/`: Architecture documentation following the Arc42 template.

## Features

- **User registration and login**: Full JWT-based authentication (access token + refresh token).
- **Play vs AI and local PvP**: Match creation supports `BOT` and `LOCAL_2P` modes with selectable board size/difficulty and rule set (`pieRule`, `honey`). Honey blocked cells are generated server-side when enabled.
- **Online multiplayer (human vs human)**: Players join matchmaking through Socket.IO (`queue:join`) and receive assignments via `matchmaking:matched`. Session state is synchronized in real time (`session:state`). If a player times out, bot fallback can play on their behalf.
- **Match history and statistics**: Registered players can view their match history, wins, losses, and performance metrics.
- **External bot API**: External bots can register and play matches against the system's AI through the public API.
- **Monitoring**: Prometheus and Grafana are available for system metrics.

## Components

### Webapp

A single-page application (SPA) built with [Vite](https://vitejs.dev/), [React](https://reactjs.org/), TypeScript, and Material UI. Uses React Router for client-side navigation.

Internal structure (`src/`):
- `features/auth/`: Login and registration pages and logic.
- `features/game/`: Game board, turn logic, and match flow.
- `features/stats/`: Player statistics visualization.
- `features/botApi/`: External bot API interface.
- `components/`: Shared reusable UI components.
- `shared/`: Shared utilities, hooks, and types.

### Users Service

A REST API built with [Node.js](https://nodejs.org/), [Express](https://expressjs.com/), and TypeScript.

- Manages user profile data in `users.db` (SQLite).
- Exposes a Swagger UI at `/api-docs` and Prometheus metrics.
- Exposed internally on port `3000`.

### Auth Service

Authentication backend built with Node.js, Express, and TypeScript.

- `src/index.ts`: Entry point, mounts routes under `/api/auth`.
- `src/routes/auth.routes.ts`: Authentication endpoints.
- `openapi.yaml`: OpenAPI 3.x contract.

Endpoints:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/verify` (**internal use only — blocked externally by Nginx with 403**)

Key environment variables:
- `JWT_SECRET` (required)
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (PostgreSQL auth connection settings)

Internal verification URL (service-to-service):
- `AUTH_INTERNAL_VERIFY_URL=http://auth:3001/api/auth/verify`

### Gamey (Game Server)

A stateless Y game engine and bot server implemented in [Rust](https://www.rust-lang.org/).

- `src/main.rs`: Entry point.
- `src/bot/`: Bot implementations and strategy registry.
- `src/core/`: Core game logic (actions, coordinates, game state, player management).
- `src/notation/`: YEN/YGN notation support.
- `src/web/`: HTTP service layer.
- `Cargo.toml`: Project manifest.

Exposed internally on port `4000`.

### Game Service

The online game and matchmaking service built with Node.js, Express, and TypeScript.

- Manages the full lifecycle of both AI and online human-vs-human matches.
- Persists match state and move history in YEN notation in PostgreSQL (`gamedb`).
- Exposes aggregated statistics per player.
- Implements a **Redis-backed matchmaking queue** to pair online players.
- Manages **real-time online sessions** via Socket.IO (with `@socket.io/redis-adapter`).
- Enforces **per-turn timeouts** and triggers **automatic bot fallback** if a player does not respond in time.
- Supports **reconnection grace periods** before penalising a disconnected player's session.

Exposed internally on port `3002`.

### Nginx (API Gateway)

The single public entry point through Nginx (`80` + `443`). Port `80` redirects to HTTPS and API/WebSocket traffic is served on `443`:

| Path | Target Service |
|---|---|
| `/api/auth/*` | Auth Service (3001) |
| `/api/users/*` | Users Service (3000) |
| `/api/game/*` | Game Service (3002) |
| `/api/gamey/*` | Game Server / Gamey (4000) |
| `/*` | React Frontend (webapp) |

`/api/auth/verify` is blocked externally (returns `403`).
Includes TLS termination, HTTP→HTTPS redirect, rate limiting (`10 req/s` with burst of 20), CORS headers, static asset caching, and SPA fallback.

### Monitoring

- **Prometheus**: Available at `http://localhost:9090`. Configuration located in `users/monitoring/prometheus/`.
- **Grafana**: Available at `http://localhost:9091`. Dashboards provisioned from `users/monitoring/grafana/provisioning/`.

---

## Running the Project

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed.
- A `.env` file created in the root directory (see [Environment Configuration](#environment-configuration)).

### With Docker (recommended)

```bash
docker-compose up --build
```

Once running:

| Service | URL |
|---|---|
| Web application | https://localhost (HTTP 80 redirects to HTTPS) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:9091 |

All backend services (auth, users, gameservice, gamey) are **internal** and only accessible through Nginx.

### Without Docker

Run each component in a separate terminal.

#### 1. Users Service

```bash
cd users
npm install
npm run dev
```

#### 2. Auth Service

```bash
cd auth
npm install
npm run start
```

#### 3. Game Service

> Requires a running Redis instance. Use Docker Compose to start it automatically.

```bash
cd gameservice
npm install
npm run dev
```

#### 4. Gamey (Game Server)

```bash
cd gamey
cargo run
```

#### 5. Webapp

```bash
cd webapp
npm install
npm run dev
```

The web application will be available at `http://localhost:5173` (Vite dev server). In Docker deployment, access through `https://localhost`.

---

## Available Scripts

### Webapp (`webapp/`)

- `npm run dev`: Start the development server.
- `npm run build`: Compile TypeScript and generate the production bundle.
- `npm test`: Run unit tests with Vitest.
- `npm run test:coverage`: Run tests with coverage report.
- `npm run test:e2e`: Run end-to-end tests with Cucumber + Playwright.
- `npm run start:all`: Start the webapp and users service concurrently (useful for local E2E testing).

### Users (`users/`)

- `npm run dev`: Start in development mode with hot reload.
- `npm run build`: Compile TypeScript.
- `npm start`: Run the compiled service.
- `npm test`: Run tests with Vitest.
- `npm run test:coverage`: Run tests with coverage report.

### Auth (`auth/`)

- `npm run start`: Start the auth service.
- `npm test`: Run auth service tests.
- `npm run test:coverage`: Run tests with coverage report.
- `npm run db:init`: Initialise the auth database schema.

### Game Service (`gameservice/`)

- `npm run dev`: Start in development mode with hot reload.
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Run the compiled service.
- `npm test`: Run tests with Vitest.
- `npm run test:coverage`: Run tests with coverage report.

### Gamey (`gamey/`)

- `cargo build`: Compile the game server.
- `cargo run`: Run the game server.
- `cargo test`: Run unit tests.
- `cargo doc`: Generate engine documentation.

---

## Environment Configuration

Create a `.env` file in the root directory before running the project with Docker:

```properties
# Secret key used to sign and verify JWT tokens
JWT_SECRET=yovi_es1c_2526

# PostgreSQL credentials (auth + gameservice)
AUTH_DB_PASSWORD=changeme
GAME_DB_PASSWORD=changeme

# Matchmaking and online session timeouts (in seconds)
MM_TIMEOUT_SEC=30
TURN_TIMEOUT_SEC=25
RECONNECT_GRACE_SEC=45
```

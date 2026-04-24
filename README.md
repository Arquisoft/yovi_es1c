# YOVI ES1C - Game Y at UniOvi

Deployment: [https://yovi-es1c.duckdns.org/](https://yovi-es1c.duckdns.org/)

[![Release - Test, Build, Publish, Deploy](https://github.com/arquisoft/yovi_es1c/actions/workflows/release-deploy.yml/badge.svg)](https://github.com/arquisoft/yovi_es1c/actions/workflows/release-deploy.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_es1c&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_es1c)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Arquisoft_yovi_es1c&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Arquisoft_yovi_es1c)
[![CodeScene Average Code Health](https://codescene.io/projects/76242/status-badges/average-code-health)](https://codescene.io/projects/76242)

YOVI is a web platform for playing the Game of Y. The repository contains a React frontend, Node/Express services, a Rust game engine and bot server, monitoring, architecture documentation, model training tools and load tests.

## Contributors

- UO302313 - David Fernando Bolaños López
- UO294946 - Raúl Velasco Vizán
- UO301919 - Ángela Nistal Guerrero
- UO300731 - Olai Navarro Baizán
- UO301831 - Alejandro Requena Roncero

## Repository Layout

| Path | What it contains |
|---|---|
| `webapp/` | React + Vite + TypeScript SPA. Includes auth screens, game screens, online matchmaking/session UI, chat, stats and ranking. |
| `auth/` | Node.js + Express + TypeScript authentication service backed by PostgreSQL. Issues access/refresh JWTs and verifies tokens for other services. |
| `users/` | Node.js + Express + TypeScript profile service backed by SQLite. Stores username/avatar profiles and exposes Prometheus metrics. |
| `gameservice/` | Node.js + Express + TypeScript game service backed by PostgreSQL and Redis. Stores matches, moves, stats, rankings and online sessions. |
| `gamey/` | Rust Game Y engine and Axum bot server. Provides CLI play, YEN notation, bots and Prometheus metrics. |
| `training/` | Offline Python pipeline for self-play, training and ONNX export of the neural policy-value model consumed by `gamey`. |
| `nginx/` | Public gateway, TLS termination, reverse proxy, WebSocket proxy, rate limiting, SPA fallback and monitoring subpaths. |
| `monitoring/` | Prometheus and Grafana configuration provisioned by Docker Compose. |
| `loadtests/` | k6 REST load tests and Artillery Socket.IO load tests for local and remote environments. |
| `docs/` | Arc42 architecture documentation built with Asciidoctor. |

## Implemented Capabilities

- Registration, login, token refresh, logout, logout-all and internal token verification in `auth`.
- User profiles with authenticated create/read/update operations in `users`.
- Bot and local two-player matches through `gameservice`, including board size, difficulty, modes, Pie rule and Honey blocked cells.
- Online human-vs-human matchmaking through Redis and Socket.IO.
- Active online sessions with synchronized state, move submission, Pie swap, turn timeout handling, reconnect grace period, abandon/forfeit and chat filtering.
- Match persistence in PostgreSQL with YEN move history.
- User statistics and ELO-style rankings.
- Rust bot API with `easy`, `medium`, `hard`, `expert_fast` and `expert` aliases, backed by heuristic bots and neural MCTS.
- Prometheus metrics for services and Grafana dashboards through Compose.
- k6 and Artillery load-test suites for auth, game creation, matchmaking, online sessions and turn timeout flows.

## Public Gateway

Docker Compose exposes Nginx on ports `80` and `443`. HTTP redirects to HTTPS. Backend containers are intended to be reached through Nginx, except `gameservice` also maps `3002:3002` for direct local diagnostics.

| Public path | Target |
|---|---|
| `/api/auth/*` | Auth service on `auth:3001` |
| `/api/users/*` | Users service on `users:3000` |
| `/api/game/*` | Game service on `gameservice:3002` |
| `/api/game/socket.io/` | Game service Socket.IO endpoint |
| `/api/gamey/*` | Gamey bot server on `gamey:4000` |
| `/play` | Gamey competition endpoint |
| `/prometheus/` | Prometheus UI/API |
| `/grafana/` | Grafana UI |
| `/*` | Webapp SPA |

`/api/auth/verify` is blocked by Nginx and is only for internal service-to-service calls.

## Docker Usage

Create `.env` from `.env.example`, then run:

```bash
docker compose up --build
```

Main local URLs:

| Service | URL |
|---|---|
| Web application | `https://localhost` |
| Nginx health check | `http://localhost/health` |
| Prometheus | `https://localhost/prometheus/` or `http://localhost:9090` |
| Grafana | `https://localhost/grafana/` or `http://localhost:9091` |
| Direct Game Service diagnostics | `http://localhost:3002` |

The Compose stack includes `auth-db`, `game-db`, `redis`, `users`, `auth`, `gameservice`, `gamey`, `webapp`, `nginx`, `prometheus` and `grafana`. The optional `certbot` service is behind the `certbot` profile.

## Local Development

Install dependencies per component and run services in separate terminals.

```bash
cd auth
npm install
npm run dev
```

```bash
cd users
npm install
npm run build
npm start
```

```bash
cd gameservice
npm install
npm run dev
```

```bash
cd gamey
cargo run -- --mode server --port 4000
```

```bash
cd webapp
npm install
npm run dev
```

Local backend development needs PostgreSQL for `auth`, PostgreSQL for `gameservice`, Redis for matchmaking/sessions and `gamey/models/yovi_model.onnx` for the neural bots. The Users service also needs `AUTH_SERVICE_URL` for protected profile routes. Using Docker Compose for infrastructure is the simplest setup.

## Environment

Root `.env.example` documents the variables used by Compose:

| Variable | Used by | Purpose |
|---|---|---|
| `IMAGE_TAG` | Compose images | Tag used for GHCR image names. |
| `PUBLIC_HOST` | Prometheus/Grafana | Public hostname for generated monitoring URLs. |
| `JWT_SECRET` | Auth, Game Service | JWT signing/verification secret. Required by `auth`. |
| `AUTH_DB_PASSWORD` | `auth-db`, `auth` | PostgreSQL password for Auth. |
| `GAME_DB_PASSWORD` | `game-db`, `gameservice` | PostgreSQL password for Game Service. |
| `PERSPECTIVE_API_KEY` | Game Service | Optional Google Perspective API key for chat moderation. |
| `PERSPECTIVE_TIMEOUT_MS` | Game Service | Perspective API timeout. |
| `PERSPECTIVE_FAIL_MODE` | Game Service | `allow` or `reject` when Perspective is unavailable. |
| `VITE_GAME_ENGINE_API_URL` | Webapp | Gamey API base path. |
| `VITE_GAME_SERVICE_API_URL` | Webapp | Game Service API base path. |
| `VITE_AUTH_API_URL` | Webapp | Auth API base path. |
| `VITE_USERS_API_URL` | Webapp | Users API base path. |
| `DUCKDNS_TOKEN`, `DUCKDNS_DOMAIN`, `CERTBOT_EMAIL` | Certbot | TLS certificate automation for DuckDNS deployments. |

## Scripts

### Webapp

- `npm run dev`: start Vite.
- `npm run build`: TypeScript build plus Vite production build.
- `npm run lint`: run ESLint.
- `npm test`: run Vitest in watch mode.
- `npm run test:coverage`: run unit tests with coverage.
- `npm run test:e2e`: start local webapp/users and run Cucumber + Playwright.
- `npm run test:e2e:docker`: run Cucumber + Playwright against an already running Docker stack.

### Auth

- `npm run dev`: start with `tsx watch`.
- `npm run start`: start `src/index.ts` with `tsx`.
- `npm run build`: compile TypeScript.
- `npm test`: run Vitest.
- `npm run test:coverage`: run tests with coverage.
- `npm run db:init`: initialize the PostgreSQL schema.

### Users

- `npm run dev`: run `src/app.ts` with `ts-node-dev`; this initializes middleware only and does not start the HTTP listener.
- `npm run build`: compile TypeScript.
- `npm start`: run compiled `dist/src/index.js`.
- `npm test`: run Vitest.
- `npm run test:coverage`: run tests with coverage.
- `npm run db:init`: initialize the SQLite schema.

### Game Service

- `npm run dev`: start with `ts-node-dev`.
- `npm run build`: compile TypeScript.
- `npm start`: run compiled `dist/src/app.js`.
- `npm test`: run Vitest.
- `npm run test:coverage`: run tests with coverage.

### Gamey

- `cargo build`: compile the Rust engine.
- `cargo run`: run CLI human mode.
- `cargo run -- --mode computer --bot medium`: play against a bot.
- `cargo run -- --mode server --port 4000`: run the HTTP bot server.
- `cargo test`: run Rust tests.
- `cargo bench`: run Criterion benchmarks.
- `cargo doc --open`: generate and open Rust docs.

### Training

- `python -m pip install -r training/requirements.txt`: install training dependencies.
- `python -m pytest training -q`: run training tests.
- `python training/train.py ...`: train and export the model.
- `python training/export_model.py ...`: export a PyTorch checkpoint to ONNX.

### Documentation

- `cd docs && npm install`: install doc tooling wrappers.
- `cd docs && npm run build`: generate HTML under `docs/build`.
- `cd docs && npm run deploy`: publish `docs/build` to GitHub Pages.

### Load Tests

See `loadtests/README.md` for k6 and Artillery commands. The suites can target the local Docker network or the deployed DuckDNS environment.

# Game Service

The online game and matchmaking service for YOVI, built with **Node.js**, **Express**, and **TypeScript**.

Exposed internally on port `3002`, accessible externally only through the Nginx API Gateway under the path `/api/game/*`.

## Responsibilities

- Persists the full lifecycle of both AI and human-vs-human matches in `game.db` (SQLite).
- Stores move history in YEN notation.
- Exposes aggregated statistics per player (wins, losses, total games).
- **Online matchmaking**: Redis-backed queue that pairs human players for online games.
- **Real-time online sessions**: Active session management via **Socket.IO** using `@socket.io/redis-adapter`.
- **Turn control**: Configurable per-turn timeout (`TURN_TIMEOUT_SEC`). If a player does not move in time, `BotFallbackService` acts automatically on their behalf.
- **Reconnection support**: Configurable grace period (`RECONNECT_GRACE_SEC`) before penalising a disconnected player's session.
- JWT verification on every authenticated request, delegated to the Auth Service via internal call.

## Internal Structure
```
src/
├── app.ts # Entry point — bootstraps services and HTTP/WebSocket server
├── controllers/
│ └── GameController.ts # REST routes under /api/game/*
├── services/
│ ├── MatchService.ts # Match CRUD for AI games
│ ├── StatsService.ts # Per-user statistics
│ ├── MatchmakingService.ts # Redis-backed matchmaking queue
│ ├── OnlineSessionService.ts # Real-time session management and turn control
│ ├── TurnTimerService.ts # Per-turn timers
│ └── BotFallbackService.ts # Automatic bot fallback when a player does not respond
├── repositories/
│ ├── MatchRepository.ts
│ ├── StatsRepository.ts
│ ├── MatchmakingRepository.ts
│ └── OnlineSessionRepository.ts
├── realtime/
│ ├── socketServer.ts # Socket.IO server setup with Redis adapter
│ └── events/ # Socket.IO event handlers
├── middleware/
│ ├── verify-jwt.ts # JWT verification middleware (calls Auth Service internally)
│ └── error-handler.ts # Global error handler
├── validation/
│ ├── game.schemas.ts # Validation for REST payloads (matches, moves)
│ └── online.schemas.ts # Validation for matchmaking payloads
├── errors/
│ └── domain-errors.ts # Typed domain errors
└── types/ # Shared TypeScript interfaces and types
```

## REST Endpoints

All endpoints require JWT authentication (`Authorization: Bearer <token>`).

### AI Matches

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/game/matches` | Create a new AI match |
| `GET` | `/api/game/matches/:id` | Get match state |
| `POST` | `/api/game/matches/:id/moves` | Add a move to a match |
| `GET` | `/api/game/stats/:userId` | Get aggregated statistics for a user |

### Online Matchmaking and Sessions

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/game/online/queue` | Join the matchmaking queue |
| `GET` | `/api/game/online/queue/match` | Poll to check if the player has been matched |
| `DELETE` | `/api/game/online/queue` | Cancel matchmaking |
| `GET` | `/api/game/online/sessions/active` | Get the current active online session for the user |
| `GET` | `/api/game/online/sessions/:matchId` | Get the state of an online session |
| `POST` | `/api/game/online/sessions/:matchId/moves` | Submit a move in an online session |

### Real-time Communication (Socket.IO)

In addition to the REST API, the service exposes a **Socket.IO** server on the same port (`3002`), accessible externally through Nginx at `/api/game/socket.io/`.

Socket.IO events handle real-time board updates, turn notifications, timeouts, and disconnection events.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `JWT_SECRET` | Key used to verify JWT tokens (must match Auth Service) | — |
| `GAME_DB_PATH` | Path to the SQLite match database file | `/app/data/game.db` |
| `AUTH_SERVICE_URL` | Internal URL of the Auth Service | `http://auth:3001` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |
| `MM_TIMEOUT_SEC` | Max seconds to wait in matchmaking queue before bot fallback | `30` |
| `TURN_TIMEOUT_SEC` | Seconds per turn before activating bot fallback | `25` |
| `RECONNECT_GRACE_SEC` | Grace period in seconds for a disconnected player to reconnect | `45` |

## Running

### With Docker (recommended)

From the project root:

```bash
docker-compose up --build
```

Redis starts automatically as part of the Compose setup.

### Locally

Requires a running Redis instance accessible at `REDIS_URL`.

```bash
npm install
npm run dev
```

## Available Scripts

- `npm run dev`: Development mode with hot reload (`ts-node-dev`).
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Run the compiled service.
- `npm test`: Run tests with Vitest.
- `npm run test:coverage`: Run tests with V8 coverage.
- `npm run test:watch`: Run tests in watch mode.
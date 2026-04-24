# Game Service

Node.js + Express + TypeScript service for match persistence, statistics, rankings, matchmaking and online sessions.

## Responsibilities

- Store matches and moves in PostgreSQL.
- Store move history in YEN notation.
- Support `BOT`, `LOCAL_2P` and online human-vs-human flows.
- Support match rules including Pie rule and Honey blocked cells.
- Queue bot moves through the Rust `gamey` service.
- Provide user statistics and ELO-style rankings.
- Pair online players through Redis-backed matchmaking.
- Maintain online sessions through Socket.IO with Redis adapter support.
- Handle turn timeouts, reconnection grace periods and abandon/forfeit.
- Filter online chat with a local bad-word/context filter and optional Google Perspective API moderation.
- Verify JWTs by calling the Auth Service internally.
- Export Prometheus metrics at `/metrics`.

## Runtime

- Default port: `3002`.
- Main entry point: `src/app.ts`.
- REST API base path: `/api/game`.
- Socket.IO path through Nginx: `/api/game/socket.io/`.
- OpenAPI contract: `openapi.yaml`.

## REST Endpoints

All `/api/game/*` endpoints require `Authorization: Bearer <access-token>`.

### Matches, Stats and Rankings

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/game/matches` | Create a match with board size, difficulty, mode and rules. |
| `GET` | `/api/game/matches/:id` | Get a match owned by the authenticated user. |
| `POST` | `/api/game/matches/:id/moves` | Add a move and queue a bot response when relevant. |
| `PUT` | `/api/game/matches/:id/finish` | Finish a match and update stats/rankings. |
| `GET` | `/api/game/stats/:userId` | Get aggregate stats for a user. |
| `GET` | `/api/game/rankings?limit=20&offset=0` | Get leaderboard entries. |
| `GET` | `/api/game/rankings/:userId` | Get one user's ranking. |

### Online Matchmaking and Sessions

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/game/online/queue` | Join matchmaking with `{ boardSize, rules }`. |
| `GET` | `/api/game/online/queue/match` | Polling fallback to obtain an assignment. |
| `DELETE` | `/api/game/online/queue` | Cancel queue participation. |
| `GET` | `/api/game/online/sessions/active` | Return the authenticated user's active session or `204`. |
| `GET` | `/api/game/online/sessions/:matchId` | Fetch a session snapshot. |
| `POST` | `/api/game/online/sessions/:matchId/moves` | Submit a move with optimistic `expectedVersion`. |
| `POST` | `/api/game/online/sessions/:matchId/reconnect` | Reconnect to a live session. |
| `POST` | `/api/game/online/sessions/:matchId/abandon` | Abandon the session. |

### Operations

| Method | Path | Description |
|---|---|---|
| `GET` | `/metrics` | Prometheus metrics. |

## Socket.IO Events

Client events include:

- `queue:join`
- `queue:cancel`
- `match:join`
- `move:play`
- `pie:swap`
- `turn:timeout`
- `chat:message`
- `session:abandon`

Server events include:

- `queue:status`
- `matchmaking:matched`
- `session:state`
- `session:error`
- `session:ended`
- `chat:message`

`session:error` uses `{ code, message, details? }`.

## Redis Keyspaces

- `mm:*`: matchmaking queue, players and assignments.
- `session:online:<matchId>`: active online session snapshot.
- `session:user-active:<userId>`: active session index per user.
- `session:dedupe:<matchId>:<userId>:<clientEventId>`: duplicate-event lock.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | None | JWT verification secret; must match Auth. |
| `PGHOST` | `game-db` in Compose | PostgreSQL host. |
| `PGPORT` | `5432` | PostgreSQL port. |
| `PGDATABASE` | `gamedb` | Database name. |
| `PGUSER` | `game_user` | Database user. |
| `PGPASSWORD` | `changeme` | Database password. |
| `PGPOOL_MAX` | `50` in Compose | PostgreSQL pool size. |
| `AUTH_SERVICE_URL` | `http://auth:3001` in Compose | Internal Auth Service URL. |
| `GAMEY_SERVICE_URL` | `http://gamey:4000` in Compose | Internal Rust bot server URL. |
| `REDIS_URL` | `redis://redis:6379` in Compose | Redis connection URL. |
| `GAMESERVICE_GAMEY_TIMEOUT_MS` | `3500` in Compose | Timeout for Gamey calls. |
| `PERSPECTIVE_API_KEY` | Empty | Optional Perspective API key. |
| `PERSPECTIVE_TIMEOUT_MS` | `1500` | Perspective API timeout. |
| `PERSPECTIVE_FAIL_MODE` | `allow` | `allow` or `reject` when Perspective is unavailable. |
| `MM_TIMEOUT_SEC` | `30` | Matchmaking wait before fallback behavior. |
| `TURN_TIMEOUT_SEC` | `25` | Turn timeout for online sessions. |
| `RECONNECT_GRACE_SEC` | `45` | Reconnect grace period. |
| `MM_ASSIGNMENT_TTL_SEC` | `120` | Temporary assignment TTL. |

## Local Development

Use Docker Compose for PostgreSQL, Redis, Auth and Gamey, or provide equivalent local services.

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev`: start with `ts-node-dev --respawn --transpile-only src/app.ts`.
- `npm run build`: compile TypeScript.
- `npm start`: run `dist/src/app.js`.
- `npm test`: run Vitest.
- `npm run test:coverage`: run tests with coverage.
- `npm run test:watch`: run Vitest in watch mode.

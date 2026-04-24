# Auth Service

Node.js + Express + TypeScript service that owns credentials, sessions and JWT lifecycle for YOVI.

## Responsibilities

- Register users and persist password credentials in PostgreSQL.
- Login users and issue access/refresh JWT pairs.
- Refresh access tokens from refresh tokens.
- Logout one session or all sessions for a user.
- Verify access tokens for internal service-to-service authentication.
- Export Prometheus metrics at `/metrics`.
- Initialize its PostgreSQL schema on startup through `scripts/init-auth-db.sql`.

## Runtime

- Default port: `3001`.
- Main entry point: `src/index.ts`.
- Express app: `src/app.ts`.
- Routes are mounted under `/api/auth`.
- OpenAPI contract: `openapi.yaml`.

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Create credentials and return tokens. |
| `POST` | `/api/auth/login` | Public | Validate credentials and return tokens. |
| `POST` | `/api/auth/refresh` | Public | Rotate/use a refresh token to issue a new access token. |
| `POST` | `/api/auth/logout` | Authenticated access token | Revoke the current session, or a supplied `sessionId`. |
| `POST` | `/api/auth/logout-all` | Authenticated access token | Revoke all refresh sessions for the token user. |
| `POST` | `/api/auth/verify` | Internal only | Verify an access token and return claims. Blocked by Nginx externally. |
| `GET` | `/metrics` | Internal/ops | Prometheus metrics. |

`/api/auth/verify` is meant for calls from other containers such as `gameservice` and `users`. Nginx returns `403` for external requests to that exact path.

## Error Contract

Most HTTP errors use:

```json
{
  "error": "invalid_input",
  "message": "Human readable message",
  "details": []
}
```

`/api/auth/verify` returns `401` with `{ "valid": false }` when a token is not valid.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | None | Secret used to sign and verify JWTs. The service fails startup if missing. |
| `PORT` | No | `3001` | HTTP port. |
| `PGHOST` | No | `localhost` | PostgreSQL host. Compose sets `auth-db`. |
| `PGPORT` | No | `5432` | PostgreSQL port. |
| `PGDATABASE` | No | `authdb` | Database name. |
| `PGUSER` | No | `auth_user` | Database user. |
| `PGPASSWORD` | No | `changeme` | Database password. |

## Local Development

```bash
npm install
npm run dev
```

`npm run start` runs `src/index.ts` directly with `tsx`. `npm run build` compiles TypeScript.

## Tests

```bash
npm test
npm run test:coverage
```

## Database Initialization

Startup calls the same initializer used by:

```bash
npm run db:init
```

The SQL file is `scripts/init-auth-db.sql`.

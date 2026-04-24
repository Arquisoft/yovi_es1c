# Users Service

Node.js + Express + TypeScript service that stores YOVI user profile data in SQLite.

## Responsibilities

- Store profile records with username and optional avatar.
- Create, fetch and update profiles.
- Verify JWT access tokens by calling the Auth Service internally.
- Export Prometheus metrics at `/metrics`.
- Initialize the SQLite schema from `src/database/users.sql`.

## Runtime

- Default port: `3000`.
- Main entry point: `src/index.ts`.
- Express app setup: `src/app.ts`.
- API routes are mounted under `/api/users`.
- Data directory in Docker: `/app/data`, mounted from `users/data`.
- OpenAPI contract: `openapi.yaml`.

## Endpoints

All profile endpoints require `Authorization: Bearer <access-token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users/profiles` | Create a profile from `{ "username": "...", "avatar": "..." }`. |
| `GET` | `/api/users/profiles/by-username/:username` | Fetch a profile by username. |
| `GET` | `/api/users/profiles/:id` | Fetch a profile by numeric id. |
| `PUT` | `/api/users/profiles/:id` | Update profile fields currently limited to `avatar`. |
| `GET` | `/metrics` | Prometheus metrics. |
| `GET` | `/` | Plain health/info response. |

The current TypeScript service does not mount Swagger UI at runtime, although `openapi.yaml` is present in the package.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_DATA_DIR` | No | Implementation default | Directory used for the SQLite database. Compose sets `/app/data`. |
| `AUTH_SERVICE_URL` | Yes for protected routes | None | Base URL of Auth Service, for example `http://auth:3001` in Docker or `http://localhost:3001` locally. |
| `ALLOWED_ORIGINS` | No | `http://localhost:5173` | Comma-separated CORS allowlist. |

## Local Development

```bash
npm install
npm run build
npm start
```

For local authenticated requests, run Auth Service too and set:

```bash
AUTH_SERVICE_URL=http://localhost:3001
```

## Scripts

- `npm run dev`: run `src/app.ts` with `ts-node-dev`; this initializes the Express app only and does not start the HTTP listener or mount `/api/users`.
- `npm run build`: compile TypeScript.
- `npm start`: run `dist/src/index.js`.
- `npm test`: run Vitest.
- `npm run test:coverage`: run tests with coverage.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run db:init`: initialize the SQLite schema.

## Tests

```bash
npm test
npm run test:coverage
```

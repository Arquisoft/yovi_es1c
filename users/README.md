# Users Service

The user profile management service for YOVI, built with **Node.js**, **Express**, and **TypeScript**.

Exposed internally on port `3000`, accessible externally only through the Nginx API Gateway under the path `/api/users/*`.

## Responsibilities

- Manages user profile data stored in `users.db` (SQLite).
- Handles user creation and profile retrieval.
- Exposes Prometheus metrics via `express-prom-bundle`.
- Exposes a Swagger UI at `/api-docs` for API exploration.

## Internal Structure
```
src/
├── app.ts # Express app setup (CORS, middleware)
├── index.ts # Entry point — initialises DB and starts the server
├── controllers/
│ └── users.controller.ts # Route handlers
├── services/
│ └── users.service.ts # Business logic
├── repositories/
│ └── users.repository.ts # Database access layer (users.db)
└── database/
└── database.ts # SQLite connection and schema initialisation
```

## REST Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/createuser` | Create a new user by username |
| `GET` | `/api-docs` | Swagger UI (OpenAPI spec) |
| `GET` | `/metrics` | Prometheus metrics endpoint |

The full OpenAPI contract is available in `openapi.yaml`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:5173` |

## Running

### With Docker (recommended)

From the project root:

```bash
docker-compose up --build
```

### Locally

```bash
npm install
npm run dev
```

The service will be available at `http://localhost:3000`.

## Available Scripts

- `npm run dev`: Development mode with hot reload (`ts-node-dev`).
- `npm run build`: Compile TypeScript to `dist/`.
- `npm start`: Run the compiled service.
- `npm test`: Run tests with Vitest.
- `npm run test:coverage`: Run tests with coverage report.
- `npm run test:watch`: Run tests in watch mode.
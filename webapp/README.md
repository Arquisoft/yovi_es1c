# Webapp

The YOVI frontend application, built as a single-page application (SPA) with **React**, **Vite**, and **TypeScript**.

In production, static assets are served by the Nginx API Gateway. In development, the Vite dev server is available at `http://localhost:5173`.

## Responsibilities

- Renders the game board and manages the client-side game flow.
- Handles user authentication (login, registration, token refresh) via the Auth Service.
- Communicates with backend services through the Nginx API Gateway.
- Establishes a **Socket.IO** connection to the Game Service for real-time online match updates.
- Displays player statistics and match history.
- Provides an interface for external bots to interact with the system API.

## Internal Structure
```
src/
├── main.tsx # Application entry point
├── app/ # Root app component and router setup
├── features/
│ ├── auth/ # Login and registration pages and logic
│ ├── game/ # Game board, turn flow, and match management
│ ├── stats/ # Player statistics and match history
│ └── botApi/ # External bot API interface
├── components/ # Shared reusable UI components
├── shared/ # Shared utilities, hooks, and TypeScript types
├── config/ # App-level configuration (API URLs, constants)
└── assets/ # Static assets (images, icons)
```

## Environment Variables (Build-time)

Configured via Vite build args in `docker-compose.yml`:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL for the Users Service API (e.g. `/api/users`) |
| `VITE_GAMEY_API_URL` | Base URL for the Gamey API (e.g. `/api/gamey`) |

## Running

### With Docker (recommended)

From the project root:

```bash
docker-compose up --build
```

The application is served at `http://localhost` via Nginx.

### Locally

```bash
npm install
npm run dev
```

The development server will be available at `http://localhost:5173`.

> When running locally without Docker, make sure the `users` service is also running. Use `npm run start:all` to start both concurrently.

## Available Scripts

- `npm run dev`: Start the Vite development server.
- `npm run build`: Compile TypeScript and generate the production bundle.
- `npm run preview`: Preview the production build locally.
- `npm run lint`: Run ESLint.
- `npm test`: Run unit tests with Vitest.
- `npm run test:coverage`: Run unit tests with coverage report.
- `npm run test:watch`: Run tests in watch mode.
- `npm run test:e2e`: Run end-to-end tests with Cucumber + Playwright (requires all services running).
- `npm run start:all`: Start the webapp and users service concurrently (shortcut for local E2E testing).
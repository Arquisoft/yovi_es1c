# Webapp

React + Vite + TypeScript single-page application for YOVI.

## Responsibilities

- Provide login, registration, logout and authenticated navigation.
- Render the Game Y board and match creation flow.
- Support bot matches, local two-player matches and online matchmaking.
- Connect to Game Service Socket.IO for online sessions.
- Display reconnect prompts for active online sessions.
- Display chat, turn timers, winner overlay and connection state.
- Show user statistics and the ranking leaderboard.
- Provide an external bot API information screen.
- Provide i18n resources for English, Spanish, French, Italian and Chinese.

## Runtime

- Development server: `http://localhost:5173`.
- Production build is served by the `webapp` container on port `80`.
- Public access in Compose is through Nginx at `https://localhost`.

## Main Routes

| Route | Screen |
|---|---|
| `/` | Authenticated home screen. |
| `/login` | Login form. |
| `/register` | Registration form. |
| `/create-match` | Match creation for bot/local/online options. |
| `/online/matchmaking` | Online matchmaking queue screen. |
| `/gamey` | Game board and session UI. |
| `/stats` | Player statistics. |
| `/ranking` | Leaderboard. |

## API Configuration

Runtime API paths are defined in `src/config/api.config.ts`.

| Variable | Default | Used for |
|---|---|---|
| `VITE_GAME_ENGINE_API_URL` | `/api/gamey` | Rust Gamey bot API. |
| `VITE_GAME_SERVICE_API_URL` | `/api/game` | Match, stats, ranking and online session REST API. |
| `VITE_AUTH_API_URL` | `/api/auth` | Login, register, refresh and logout. |
| `VITE_USERS_API_URL` | `/api/users` | User profile API. |

Socket.IO connects through the Nginx-compatible path `/api/game/socket.io`.

## Internal Structure

| Path | Purpose |
|---|---|
| `src/app/` | Root app, routes, theme and global styles. |
| `src/components/` | Shared UI components and layout. |
| `src/config/` | API configuration. |
| `src/features/auth/` | Auth API, context, login and registration UI. |
| `src/features/game/` | Game API clients, hooks, realtime client, board and session UI. |
| `src/features/stats/` | Stats hooks and UI. |
| `src/features/ranking/` | Ranking hooks and UI. |
| `src/features/botApi/` | External bot API UI. |
| `src/i18n/` | i18next setup and locale files. |
| `src/shared/` | Shared API helpers and contracts. |
| `src/__tests__/` | Vitest component/hook/unit tests. |
| `test/e2e/` | Cucumber + Playwright end-to-end tests. |

## Local Development

```bash
npm install
npm run dev
```

For full functionality, run the backend stack too. The default dev configuration expects the gateway-style API paths unless overridden with Vite env variables.

## Scripts

- `npm run dev`: start Vite.
- `npm run build`: run `tsc -b` and `vite build`.
- `npm run preview`: preview the production build.
- `npm run lint`: run ESLint.
- `npm test`: run Vitest.
- `npm run test:coverage`: run unit tests with coverage.
- `npm run test:watch`: run Vitest in watch mode.
- `npm run test:e2e`: start `start:all`, wait for `http://localhost:5173`, then run Cucumber + Playwright.
- `npm run test:e2e:run`: run Cucumber + Playwright directly.
- `npm run test:e2e:docker`: run Cucumber + Playwright against an already running Docker stack.
- `npm run test:e2e:install-browsers`: install Playwright browsers.
- `npm run start:all`: start Vite and `../users` with `npm start`; build `../users` first if `dist/` is not present.

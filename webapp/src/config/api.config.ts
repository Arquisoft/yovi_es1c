export const API_CONFIG = {
    GAME_ENGINE_API: import.meta.env.VITE_GAME_ENGINE_API_URL ?? "/api/gamey",
    GAME_SERVICE_API: import.meta.env.VITE_GAME_SERVICE_API_URL ?? "/api/game",
    AUTH_API: import.meta.env.VITE_AUTH_API_URL ?? "/api/auth",
    USERS_API: import.meta.env.VITE_USERS_API_URL ?? "/api/users"
} as const;

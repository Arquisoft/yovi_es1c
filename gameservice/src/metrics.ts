import { collectDefaultMetrics, Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const activeGames = new Gauge({
    name: 'gameservice_active_games_total',
    help: 'Partidas activas en este momento',
    registers: [register],
});

export const gamesCreated = new Counter({
    name: 'gameservice_games_created_total',
    help: 'Total de partidas creadas',
    labelNames: ['mode'] as const,
    registers: [register],
});

export const gamesFinished = new Counter({
    name: 'gameservice_games_finished_total',
    help: 'Total de partidas terminadas',
    labelNames: ['winner'] as const,
    registers: [register],
});

export const botMoveDuration = new Histogram({
    name: 'gameservice_bot_move_duration_seconds',
    help: 'Tiempo de cálculo del bot',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
});

export const activeSocketConnections = new Gauge({
    name: 'gameservice_socket_connections_active',
    help: 'Conexiones Socket.IO activas',
    registers: [register],
});

export const matchmakingDuration = new Histogram({
    name: 'gameservice_matchmaking_duration_seconds',
    help: 'Tiempo hasta encontrar pareja',
    buckets: [1, 5, 10, 20, 30],
    registers: [register],
});

export const matchmakingEvents = new Counter({
    name: 'gameservice_matchmaking_events_total',
    help: 'Eventos relevantes del matchmaking',
    labelNames: ['event', 'result'] as const,
    registers: [register],
});

export const onlineMoves = new Counter({
    name: 'gameservice_online_moves_total',
    help: 'Movimientos válidos aplicados en sesiones online',
    registers: [register],
});

export const onlineMoveErrors = new Counter({
    name: 'gameservice_online_move_errors_total',
    help: 'Errores al procesar movimientos en sesiones online',
    labelNames: ['code'] as const,
    registers: [register],
});

export const onlineChatMessages = new Counter({
    name: 'gameservice_online_chat_messages_total',
    help: 'Mensajes de chat enviados en sesiones online',
    registers: [register],
});

export const reconnectEvents = new Counter({
    name: 'gameservice_online_reconnect_events_total',
    help: 'Eventos de desconexión y reconexión',
    labelNames: ['event'] as const,
    registers: [register],
});

export const onlineSessionEvents = new Counter({
    name: 'gameservice_online_session_events_total',
    help: 'Eventos del ciclo de vida de sesiones online',
    labelNames: ['event'] as const,
    registers: [register],
});

export const turnTimeouts = new Counter({
    name: 'gameservice_online_turn_timeouts_total',
    help: 'Timeouts de turno procesados',
    registers: [register],
});

export const authVerifyDuration = new Histogram({
    name: 'gameservice_auth_verify_duration_seconds',
    help: 'Duración de verificación de JWT contra auth service',
    labelNames: ['result'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [register],
});

export const authVerifyCacheEvents = new Counter({
    name: 'gameservice_auth_verify_cache_events_total',
    help: 'Eventos de caché de verificación JWT',
    labelNames: ['event'] as const,
    registers: [register],
});

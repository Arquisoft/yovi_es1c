import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { initDB } from "./database/database";
import { MatchRepository } from "./repositories/MatchRepository";
import { StatsRepository } from "./repositories/StatsRepository";
import { MatchService } from "./services/MatchService";
import { StatsService } from "./services/StatsService";
import { createGameController } from "./controllers/GameController";
import { errorHandler } from "./middleware/error-handler";
import { verifyJwtMiddleware } from "./middleware/verify-jwt";
import { attachSocketServer } from "./realtime/socketServer";
import { register } from './metrics';

process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled Promise Rejection (service kept alive):', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[process] Uncaught Exception (service kept alive):', err);
});

const app = express();
app.use(express.json());

/**
 * Endpoint expuesto para prometheus
 */
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

(async () => {
    const db = await initDB();

    const matchRepo = new MatchRepository(db);
    const statsRepo = new StatsRepository(db);

    const matchService = new MatchService(matchRepo);
    const statsService = new StatsService(statsRepo);

    const server = createServer(app);
    const realtimeBundle = await attachSocketServer(server, { statsService, matchService });

    app.use(
        "/api/game",
        verifyJwtMiddleware,
        createGameController(
            matchService,
            statsService,
            realtimeBundle?.matchmakingService,
            realtimeBundle?.onlineSessionService,
        )
    );

    app.use(errorHandler);

    server.listen(3002, () => {
        console.log("GameService running on port 3002");
    });
})();
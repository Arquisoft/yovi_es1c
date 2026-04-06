import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initDB } from "./database/database";
import { MatchRepository } from "./repositories/MatchRepository";
import { StatsRepository } from "./repositories/StatsRepository";
import { MatchService } from "./services/MatchService";
import { StatsService } from "./services/StatsService";
import { createGameController } from "./controllers/GameController";
import { errorHandler } from "./middleware/error-handler";
import { verifyJwtMiddleware } from "./middleware/verify-jwt";
import { MatchmakingRepository } from "./repositories/MatchmakingRepository";
import { MatchmakingService } from "./services/MatchmakingService";
import { BotFallbackService } from "./services/BotFallbackService";
import { OnlineSessionRepository } from "./repositories/OnlineSessionRepository";
import { OnlineSessionService } from "./services/OnlineSessionService";
import { TurnTimerService } from "./services/TurnTimerService";
import { attachSocketServer } from "./realtime/socketServer";
import { register } from './metrics';

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled Promise Rejection (service kept alive):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught Exception (service kept alive):', err);
});


const app = express();
app.use(cors());
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

  const matchmakingService = new MatchmakingService(
      new MatchmakingRepository(),
      statsService,
      new BotFallbackService(),
      Number(process.env.MM_TIMEOUT_SEC ?? 30)
  );

  const onlineSessionService = new OnlineSessionService(
      new OnlineSessionRepository(),
      new TurnTimerService(),
      Number(process.env.TURN_TIMEOUT_SEC ?? 25),
      Number(process.env.RECONNECT_GRACE_SEC ?? 60),
      {},
      matchService
  );

  const server = createServer(app);
  const realtimeBundle = await attachSocketServer(server, { statsService, matchService });

  const controllerMatchmakingService =
      realtimeBundle?.matchmakingService ?? matchmakingService;

  const controllerOnlineSessionService =
      realtimeBundle?.onlineSessionService ?? onlineSessionService;

  app.use(
      "/api/game",
      verifyJwtMiddleware,
      createGameController(
          matchService,
          statsService,
          controllerMatchmakingService,
          controllerOnlineSessionService
      )
  );

  app.use(errorHandler);

  server.listen(3002, () => {
    console.log("GameService running on port 3002");
  });
})();

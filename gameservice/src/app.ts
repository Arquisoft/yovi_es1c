import express from "express";
import cors from "cors";
import { initDB } from "./database/database";
import { MatchRepository } from "./repositories/MatchRepository";
import { StatsRepository } from "./repositories/StatsRepository";
import { MatchService } from "./services/MatchService";
import { StatsService } from "./services/StatsService";
import { createGameController } from "./controllers/GameController";

const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  const db = await initDB();

  const matchRepo = new MatchRepository(db);
  const statsRepo = new StatsRepository(db);

  const matchService = new MatchService(matchRepo);
  const statsService = new StatsService(statsRepo);

  app.use("/api/game", createGameController(matchService, statsService));

  app.listen(3002, () => {
    console.log("GameService running on port 3002");
  });
})();
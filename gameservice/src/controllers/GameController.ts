import { Router } from "express";
import { MatchService } from "../services/MatchService";
import { StatsService } from "../services/StatsService";

export function createGameController(matchService: MatchService, statsService: StatsService) {
  const router = Router();

  router.post("/matches", async (req, res) => {
    const { userId, boardSize, strategy, difficulty } = req.body;
    const id = await matchService.createMatch(userId, boardSize, strategy, difficulty);
    res.json({ matchId: id });
  });

  router.get("/matches/:id", async (req, res) => {
    const match = await matchService.getMatch(Number(req.params.id));
    res.json(match);
  });

  router.post("/matches/:id/moves", async (req, res) => {
    const { position, player, moveNumber } = req.body;
    await matchService.addMove(Number(req.params.id), position, player, moveNumber);
    res.json({ message: "Move added" });
  });

  router.get("/stats/:userId", async (req, res) => {
    const stats = await statsService.getStats(Number(req.params.userId));
    res.json(stats);
  });

  return router;
}
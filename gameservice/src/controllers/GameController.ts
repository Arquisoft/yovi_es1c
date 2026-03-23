import { Router, NextFunction, Request, Response } from "express";
import { MatchService } from "../services/MatchService";
import { StatsService } from "../services/StatsService";
import { InvalidMoveError, MatchNotFoundError, UnauthorizedMatchError } from "../errors/domain-errors";
import { validateCreateMatch, validateAddMove, validateUserId, validateMatchId } from "../validation/game.schemas";

export function createGameController(matchService: MatchService, statsService: StatsService) {
  const router = Router();

  router.post("/matches", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId ? Number(req.userId) : undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Invalid user ID in token' });
      }

      const validated = validateCreateMatch(req.body);
      const id = await matchService.createMatch(userId, validated.boardSize, validated.difficulty);
      res.status(201).json({ matchId: id });
    } catch (error) {
      next(error);
    }
  });

  router.get("/matches/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = validateMatchId(req.params.id);
      const match = await matchService.getMatch(matchId);

      if (!match) {
        throw new MatchNotFoundError();
      }

      if (match.user_id !== Number(req.userId)) {
        throw new UnauthorizedMatchError();
      }

      res.json(match);
    } catch (error) {
      next(error);
    }
  });

  router.post("/matches/:id/moves", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = validateMatchId(req.params.id);
      const validated = validateAddMove(req.body);

      // Verify match exists
      const match = await matchService.getMatch(matchId);
      if (!match) {
        throw new MatchNotFoundError();
      }

      // Verify user owns the match
      if (match.user_id !== Number(req.userId)) {
        throw new UnauthorizedMatchError();
      }

      // Verify match is still ongoing
      if (match.status !== 'ONGOING') {
        throw new InvalidMoveError('Cannot add moves to a finished match');
      }

      await matchService.addMove(matchId, validated.position_yen, validated.player, validated.moveNumber);
      res.status(201).json({ message: "Move added" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/stats/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = validateUserId(req.params.userId);
      const stats = await statsService.getStats(userId);
      res.json(stats || { user_id: userId, wins: 0, losses: 0, total_games: 0, win_rate: 0 });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

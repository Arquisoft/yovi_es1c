import { Router, NextFunction, Request, Response } from "express";
import { MatchService } from "../services/MatchService";
import { StatsService } from "../services/StatsService";
import { InvalidMoveError, MatchNotFoundError, UnauthorizedMatchError } from "../errors/domain-errors";
import { validateCreateMatch, validateAddMove, validateUserId, validateMatchId } from "../validation/game.schemas";
import { MatchmakingService } from "../services/MatchmakingService";
import { OnlineSessionService } from "../services/OnlineSessionService";
import { validateQueueJoin } from "../validation/online.schemas";

export function createGameController(
    matchService: MatchService,
    statsService: StatsService,
    matchmakingService?: MatchmakingService,
    onlineSessionService?: OnlineSessionService,
) {
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

      const match = await matchService.getMatch(matchId);
      if (!match) {
        throw new MatchNotFoundError();
      }

      if (match.user_id !== Number(req.userId)) {
        throw new UnauthorizedMatchError();
      }

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

  router.post('/online/queue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!matchmakingService || !req.userId || !req.username) {
        return res.status(503).json({ error: 'Online matchmaking not available' });
      }
      const payload = validateQueueJoin(req.body);
      const queued = await matchmakingService.joinQueue({
        userId: Number(req.userId),
        username: req.username,
        boardSize: payload.boardSize,
        socketId: `http:${req.userId}`,
      });
      res.status(201).json({ queued: true, joinedAt: queued.joinedAt });
    } catch (error) {
      next(error);
    }
  });

  router.get('/online/queue/match', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!matchmakingService || !onlineSessionService || !req.userId || !req.username) {
        return res.status(503).json({ error: 'Online matchmaking not available' });
      }

      const userId = Number(req.userId);
      const assignment = await matchmakingService.tryMatch(userId);
      if (!assignment) {
        return res.json({ matched: false });
      }

      if (!assignment.playerB) {
        return res.json({ matched: false });
      }

      let state = await onlineSessionService.getSnapshot(assignment.matchId);
      if (!state) {
        state = await onlineSessionService.createSession(
            assignment.matchId,
            assignment.playerA.boardSize,
            [
              { userId: assignment.playerA.userId, username: assignment.playerA.username },
              { userId: assignment.playerB.userId, username: assignment.playerB.username },
            ],
            'HUMAN',
        );
      }

      const opponent = state.players.find((player) => player.userId !== userId);

      return res.json({
        matched: true,
        matchId: assignment.matchId,
        opponent: opponent?.username ?? 'Unknown',
        revealAfterGame: assignment.revealAfterGame,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/online/queue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!matchmakingService || !req.userId) {
        return res.status(503).json({ error: 'Online matchmaking not available' });
      }
      await matchmakingService.cancelQueue(Number(req.userId));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get('/online/sessions/active', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!onlineSessionService) {
        return res.status(503).json({ error: 'Online sessions not available' });
      }
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const active = await onlineSessionService.getActiveSessionForUser(Number(req.userId));
      if (!active) {
        return res.status(204).send();
      }
      return res.status(200).json(active);
    } catch (error) {
      next(error);
    }
  });

  router.get('/online/sessions/:matchId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!onlineSessionService) {
        return res.status(503).json({ error: 'Online sessions not available' });
      }
      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const state = await onlineSessionService.getSnapshot(matchId);
      if (!state) {
        return res.status(404).json({ error: 'Online session not found' });
      }
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  router.post('/online/sessions/:matchId/moves', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!onlineSessionService || !req.userId) {
        return res.status(503).json({ error: 'Online sessions not available' });
      }

      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const move = req.body?.move as { row?: number; col?: number };
      const expectedVersion = req.body?.expectedVersion;

      if (!move || typeof move.row !== 'number' || typeof move.col !== 'number' || typeof expectedVersion !== 'number') {
        return res.status(400).json({ error: 'Invalid move payload' });
      }

      const updated = await onlineSessionService.handleMove(matchId, Number(req.userId), { row: move.row, col: move.col }, expectedVersion);
      return res.status(201).json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

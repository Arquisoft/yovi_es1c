import { Router, NextFunction, Request, Response } from "express";
import { MatchService } from "../services/MatchService";
import { StatsService } from "../services/StatsService";
import { InvalidMoveError, MatchAlreadyFinishedError, MatchNotFoundError, UnauthorizedMatchError } from "../errors/domain-errors";
import { validateCreateMatch, validateAddMove, validateUserId, validateMatchId, validateFinishMatch } from "../validation/game.schemas";
import { MatchmakingService } from "../services/MatchmakingService";
import { OnlineSessionError, OnlineSessionService } from "../services/OnlineSessionService";
import { validateQueueJoin } from "../validation/online.schemas";
import { apiError } from "../errors/error-catalog";

export function createGameController(
    matchService: MatchService,
    statsService: StatsService,
    matchmakingService?: MatchmakingService,
    onlineSessionService?: OnlineSessionService,
) {
  const router = Router();

  const handleOnlineError = (res: Response, error: OnlineSessionError) => {
    if (error.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json(apiError(error.code, error.message));
    }
    if (
        error.code === 'VERSION_CONFLICT'
        || error.code === 'RECONNECT_EXPIRED'
        || error.code === 'SESSION_TERMINAL'
        || error.code === 'DUPLICATE_EVENT'
    ) {
      return res.status(409).json(apiError(error.code, error.message));
    }
    if (error.code === 'UNAUTHORIZED' || error.code === 'NOT_YOUR_TURN') {
      return res.status(403).json(apiError(error.code, error.message));
    }
    return res.status(400).json(apiError(error.code, error.message));
  };

  router.post("/matches", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId ? Number(req.userId) : undefined;
      if (!userId) {
        return res.status(401).json(apiError('UNAUTHORIZED', 'Invalid user ID in token'));
      }

      const validated = validateCreateMatch(req.body);
      const id = await matchService.createMatch(userId, validated.boardSize, validated.difficulty, validated.mode);
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

  router.put("/matches/:id/finish", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = validateMatchId(req.params.id);
      const validated = validateFinishMatch(req.body);

      const match = await matchService.getMatch(matchId);
      if (!match) {
        throw new MatchNotFoundError();
      }

      if (match.user_id !== Number(req.userId)) {
        throw new UnauthorizedMatchError();
      }

      if (match.status !== 'ONGOING') {
        throw new MatchAlreadyFinishedError();
      }

      await matchService.finishMatch(matchId, validated.winner);
      res.status(200).json({ message: "Match finished" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/stats/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = validateUserId(req.params.userId);
      const stats = await statsService.getFullStats(userId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  router.post("/matches/:id/finish", async (req, res, next) => {
    try {
      const matchId = validateMatchId(req.params.id);
      const validated = validateFinishMatch(req.body); // 'USER' | 'BOT'

      const match = await matchService.getMatch(matchId);
      if (!match) throw new MatchNotFoundError();
      if (match.user_id !== Number(req.userId)) throw new UnauthorizedMatchError();
      if (match.status !== 'ONGOING') {
        return res.status(409).json(apiError('MATCH_ALREADY_FINISHED', 'Match is already finished'));
      }

      await matchService.finishMatch(matchId, validated.winner);
      res.status(200).json({ message: "Match finished" });
    } catch (error) {
      next(error);
    }
  });

  router.post('/online/queue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!matchmakingService || !req.userId || !req.username) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online matchmaking not available'));
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
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online matchmaking not available'));
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
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online matchmaking not available'));
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
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }
      if (!req.userId) {
        return res.status(401).json(apiError('UNAUTHORIZED', 'Unauthorized'));
      }
      const active = await onlineSessionService.getActiveSessionForUser(Number(req.userId));
      if (!active) {
        return res.status(204).send();
      }
      const snapshot = typeof (onlineSessionService as any).getSnapshot === 'function'
          ? await onlineSessionService.getSnapshot(active.matchId)
          : null;
      return res.status(200).json({
        ...active,
        status: snapshot?.status ?? 'active',
        reconnectDeadline: snapshot?.reconnectDeadline?.[Number(req.userId)] ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/online/sessions/:matchId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!onlineSessionService) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }
      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const state = await onlineSessionService.getSnapshot(matchId);
      if (!state) {
        return res.status(404).json(apiError('SESSION_NOT_FOUND', 'Online session not found'));
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
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }

      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const move = req.body?.move as { row?: number; col?: number };
      const expectedVersion = req.body?.expectedVersion;

      if (!move || typeof move.row !== 'number' || typeof move.col !== 'number' || typeof expectedVersion !== 'number') {
        return res.status(400).json(apiError('VALIDATION_ERROR', 'Invalid move payload'));
      }

      const updated = await onlineSessionService.handleMove(matchId, Number(req.userId), { row: move.row, col: move.col }, expectedVersion);
      return res.status(201).json(updated);
    } catch (error) {
      if (error instanceof OnlineSessionError) {
        return handleOnlineError(res, error);
      }
      next(error);
    }
  });

  router.post('/online/sessions/:matchId/reconnect', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!onlineSessionService || !req.userId) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }

      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const snapshot = await onlineSessionService.reconnect(matchId, Number(req.userId));
      if (!snapshot) {
        return res.status(404).json(apiError('SESSION_NOT_FOUND', 'Session not found'));
      }
      return res.status(200).json(snapshot);
    } catch (error) {
      if (error instanceof OnlineSessionError) {
        return handleOnlineError(res, error);
      }
      next(error);
    }
  });

  router.post('/online/sessions/:matchId/abandon', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!onlineSessionService || !req.userId) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }

      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      await onlineSessionService.abandon(matchId, Number(req.userId));
      return res.status(204).send();
    } catch (error) {
      if (error instanceof OnlineSessionError) {
        return handleOnlineError(res, error);
      }
      next(error);
    }
  });

  return router;
}
import { Router, NextFunction, Request, Response } from "express";
import { MatchService } from "../services/MatchService";
import { StatsService } from "../services/StatsService";
import { RankingService } from "../services/RankingService";
import { InvalidMoveError, MatchAlreadyFinishedError, MatchNotFoundError, UnauthorizedMatchError, ValidationError } from "../errors/domain-errors";
import { validateCreateMatch, validateAddMove, validateUserId, validateMatchId, validateFinishMatch } from "../validation/game.schemas";
import { MatchmakingService } from "../services/MatchmakingService";
import { OnlineSessionError, OnlineSessionService } from "../services/OnlineSessionService";
import { validateCreateFriendInvite, validateFriendInviteId, validateQueueJoin } from "../validation/online.schemas";
import { apiError } from "../errors/error-catalog";
import { FriendshipClient } from "../services/FriendshipClient";

const DEFAULT_LEADERBOARD_LIMIT = 20;
const MAX_LEADERBOARD_LIMIT = 100;

function parseLeaderboardPagination(query: Record<string, unknown>): { limit: number; offset: number } {
  const rawLimit = query.limit;
  const rawOffset = query.offset;

  const limit = rawLimit === undefined ? DEFAULT_LEADERBOARD_LIMIT : Number(rawLimit);
  const offset = rawOffset === undefined ? 0 : Number(rawOffset);

  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LEADERBOARD_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_LEADERBOARD_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ValidationError('offset must be a non-negative integer');
  }
  return { limit, offset };
}

export function createGameController(
    matchService: MatchService,
    statsService: StatsService,
    matchmakingService?: MatchmakingService,
    onlineSessionService?: OnlineSessionService,
    rankingService?: RankingService,
    friendshipClient?: FriendshipClient,
) {
  const router = Router();

  const handleOnlineError = (res: Response, error: OnlineSessionError) => {
    if (error.code === 'SESSION_NOT_FOUND' || error.code === 'FRIEND_INVITE_NOT_FOUND') {
      return res.status(404).json(apiError(error.code, error.message));
    }
    if (
        error.code === 'VERSION_CONFLICT'
        || error.code === 'RECONNECT_EXPIRED'
        || error.code === 'SESSION_TERMINAL'
        || error.code === 'DUPLICATE_EVENT'
        || error.code === 'FRIEND_INVITE_EXPIRED'
        || error.code === 'FRIEND_INVITE_ALREADY_PENDING'
    ) {
      return res.status(409).json(apiError(error.code, error.message));
    }
    if (error.code === 'UNAUTHORIZED' || error.code === 'NOT_YOUR_TURN' || error.code === 'FRIEND_INVITE_FORBIDDEN') {
      return res.status(403).json(apiError(error.code, error.message));
    }
    return res.status(400).json(apiError(error.code, error.message));
  };

  const runOnlineRoute = async (
      res: Response,
      next: NextFunction,
      action: () => Promise<void>,
  ) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      await action();
    } catch (error) {
      if (error instanceof OnlineSessionError) {
        handleOnlineError(res, error);
        return;
      }
      next(error);
    }
  };

  const requireOnlineSessionService = (res: Response, message: string): OnlineSessionService | null => {
    if (!onlineSessionService) {
      res.status(503).json(apiError('SERVICE_UNAVAILABLE', message));
      return null;
    }
    return onlineSessionService;
  };

  const requireUserId = (req: Request, res: Response): number | null => {
    if (!req.userId) {
      res.status(401).json(apiError('UNAUTHORIZED', 'Unauthorized'));
      return null;
    }
    return Number(req.userId);
  };

  const sendOptionalJson = <T>(res: Response, payload: T | null | undefined): void => {
    if (!payload) {
      res.status(204).send();
      return;
    }
    res.status(200).json(payload);
  };

  let defaultFriendshipClient: FriendshipClient | null = null;
  const getFriendshipClient = (): FriendshipClient => {
    if (friendshipClient) return friendshipClient;
    defaultFriendshipClient ??= new FriendshipClient();
    return defaultFriendshipClient;
  };

  router.post("/matches", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId ? Number(req.userId) : undefined;
      if (!userId) {
        return res.status(401).json(apiError('UNAUTHORIZED', 'Invalid user ID in token'));
      }

      const validated = validateCreateMatch(req.body);
      const id = await matchService.createMatch(userId, validated.boardSize, validated.difficulty, validated.mode, validated.rules);
      res.status(201).json({ matchId: id });
    } catch (error) {
      next(error);
    }
  });

  router.get("/matches/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = validateMatchId(req.params.id);
      const match = await matchService.getMatchState(matchId);

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
      matchService.queueBotMove(matchId);
      res.status(202).json({ status: 'processing', matchId });
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

      await matchService.finishMatch(matchId, validated.winner, undefined, req.username);
      res.status(200).json({ message: "Match finished" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/rankings", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!rankingService) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Ranking service not available'));
      }
      const { limit, offset } = parseLeaderboardPagination(req.query as Record<string, unknown>);
      const leaderboard = await rankingService.getLeaderboard(limit, offset);
      res.json(leaderboard);
    } catch (error) {
      next(error);
    }
  });

  router.get("/rankings/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!rankingService) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Ranking service not available'));
      }
      const userId = validateUserId(req.params.userId);
      const ranking = await rankingService.getUserRanking(userId);
      if (!ranking) {
        return res.status(404).json(apiError('RANKING_NOT_FOUND', 'User has no ranking yet'));
      }
      res.json(ranking);
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
        rules: payload.rules,
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
            assignment.playerA.rules,
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

  router.post('/online/friend-invites', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Friend match invites not available');
    if (!service) return;
    if (!req.userId || !req.username) {
      res.status(401).json(apiError('UNAUTHORIZED', 'Unauthorized'));
      return;
    }

    const payload = validateCreateFriendInvite(req.body);
    const userId = Number(req.userId);
    if (payload.friendUserId === userId) {
      res.status(400).json(apiError('VALIDATION_ERROR', 'friendUserId must be different from current user'));
      return;
    }

    const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const friendship = await getFriendshipClient().getFriendshipStatus(payload.friendUserId, authHeader);
    const friend = friendship.user;
    if (!friendship.friend || !friend?.username) {
      res.status(403).json(apiError('FRIENDSHIP_REQUIRED', 'Users must be friends to create a friend match invite'));
      return;
    }

    const invite = await service.createFriendInvite(
        { userId, username: req.username },
        { userId: friend.userId ?? friend.id, username: friend.username },
        payload.boardSize,
        payload.rules,
    );

    res.status(201).json(invite);
  }));

  router.get('/online/friend-invites/pending', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Friend match invites not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    sendOptionalJson(res, await service.getPendingFriendInviteForUser(userId));
  }));

  router.get('/online/friend-invites/outgoing', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Friend match invites not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    sendOptionalJson(res, await service.getOutgoingFriendInviteForUser(userId));
  }));

  router.post('/online/friend-invites/:inviteId/accept', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Friend match invites not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    const inviteId = validateFriendInviteId(req.params.inviteId);
    const ready = await service.acceptFriendInvite(inviteId, userId);
    res.status(201).json(ready);
  }));

  router.post('/online/friend-invites/:inviteId/decline', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Friend match invites not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    const inviteId = validateFriendInviteId(req.params.inviteId);
    await service.declineFriendInvite(inviteId, userId);
    res.status(204).send();
  }));

  router.get('/online/rematches/pending', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Online sessions not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    sendOptionalJson(res, await service.getPendingRematchForUser(userId));
  }));

  router.get('/online/sessions/active', (req: Request, res: Response, next: NextFunction) => runOnlineRoute(res, next, async () => {
    const service = requireOnlineSessionService(res, 'Online sessions not available');
    const userId = requireUserId(req, res);
    if (!service || !userId) return;

    sendOptionalJson(res, await service.getActiveSessionForUser(userId));
  }));

  router.get('/online/sessions/:matchId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!onlineSessionService) {
        return res.status(503).json(apiError('SERVICE_UNAVAILABLE', 'Online sessions not available'));
      }
      if (!req.userId) {
        return res.status(401).json(apiError('UNAUTHORIZED', 'Unauthorized'));
      }

      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      const state = await onlineSessionService.getSnapshot(matchId);
      if (!state) {
        return res.status(404).json(apiError('SESSION_NOT_FOUND', 'Online session not found'));
      }
      if (!state.players.some((player) => player.userId === Number(req.userId))) {
        return res.status(403).json(apiError('UNAUTHORIZED', 'User is not part of this session'));
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
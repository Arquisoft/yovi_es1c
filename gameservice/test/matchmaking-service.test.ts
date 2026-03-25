import { describe, expect, it, vi } from 'vitest';
import { MatchmakingRepository } from '../src/repositories/MatchmakingRepository';
import { MatchmakingService } from '../src/services/MatchmakingService';
import { BotFallbackService } from '../src/services/BotFallbackService';
import { StatsService } from '../src/services/StatsService';

describe('MatchmakingService', () => {
  const statsService = {
    getWinRateForUser: vi.fn(async (id: number) => (id === 1 ? 52 : 55)),
  } as unknown as StatsService;

  it('matches two human players', async () => {
    const repo = new MatchmakingRepository();
    const service = new MatchmakingService(repo, statsService, new BotFallbackService(), 30);

    await service.joinQueue({ userId: 1, username: 'alice', boardSize: 8, socketId: 's1' });
    await service.joinQueue({ userId: 2, username: 'bob', boardSize: 8, socketId: 's2' });

    const assignment = await service.tryMatch(1, Date.now() + 11_000);
    expect(assignment?.opponentType).toBe('HUMAN');
    expect(assignment?.playerB?.username).toBe('bob');
  });

  it('triggers bot fallback after timeout', async () => {
    const repo = new MatchmakingRepository();
    const service = new MatchmakingService(repo, statsService, new BotFallbackService(), 30);

    const queued = await service.joinQueue({ userId: 1, username: 'alice', boardSize: 8, socketId: 's1' });
    const assignment = await service.tryMatch(1, queued.joinedAt + 31_000);

    expect(assignment?.opponentType).toBe('BOT');
    expect(assignment?.revealAfterGame).toBe(true);
  });

  it('handles race condition via lua claim path', async () => {
    const evalMock = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repo = new MatchmakingRepository({ eval: evalMock });

    await repo.enqueue({ userId: 1, username: 'a', boardSize: 8, skillBand: 2, joinedAt: 1, socketId: 'x', queueJoinId: 'q1' });
    await repo.enqueue({ userId: 2, username: 'b', boardSize: 8, skillBand: 2, joinedAt: 2, socketId: 'y', queueJoinId: 'q2' });

    const first = await repo.claimPair(
        { userId: 1, username: 'a', boardSize: 8, skillBand: 2, joinedAt: 1, socketId: 'x', queueJoinId: 'q1' },
        { userId: 2, username: 'b', boardSize: 8, skillBand: 2, joinedAt: 2, socketId: 'y', queueJoinId: 'q2' },
    );
    const second = await repo.claimPair(
        { userId: 1, username: 'a', boardSize: 8, skillBand: 2, joinedAt: 1, socketId: 'x', queueJoinId: 'q1' },
        { userId: 2, username: 'b', boardSize: 8, skillBand: 2, joinedAt: 2, socketId: 'y', queueJoinId: 'q2' },
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(repo.getClaimLuaScript()).toContain('sadd');
  });

  it('stores queue entries in redis and supports cancelQueue', async () => {
    const redis = {
      zAdd: vi.fn().mockResolvedValue(1),
      zRem: vi.fn().mockResolvedValue(1),
      zRange: vi.fn().mockResolvedValue([]),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockResolvedValue({ userId: '9', username: 'neo', boardSize: '8', skillBand: '2', joinedAt: '11', socketId: 's9', queueJoinId: 'q9' }),
      del: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
    };
    const service = new MatchmakingService(new MatchmakingRepository(), statsService, new BotFallbackService(), 30, { redis });

    await service.joinQueue({ userId: 9, username: 'neo', boardSize: 8, socketId: 's9' });
    await service.cancelQueue(9);

    expect(redis.zAdd).toHaveBeenCalled();
    expect(redis.hSet).toHaveBeenCalled();
    expect(redis.zRem).toHaveBeenCalledWith('mm:queue:8', ['9']);
    expect(redis.del).toHaveBeenCalledWith('mm:player:9');
  });

  it('runMatchmakingTick emits and persists initial session for redis queue', async () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const redis = {
      zAdd: vi.fn().mockResolvedValue(1),
      zRem: vi.fn().mockResolvedValue(2),
      zRange: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'mm:boards') return ['8'];
        if (key === 'mm:queue:8') return ['1', '2'];
        return [];
      }),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockImplementation(async (key: string) => {
        if (key.endsWith(':1')) return { userId: '1', username: 'alice', boardSize: '8', skillBand: '2', joinedAt: '1', socketId: 's1', queueJoinId: 'q1' };
        return { userId: '2', username: 'bob', boardSize: '8', skillBand: '2', joinedAt: '2', socketId: 's2', queueJoinId: 'q2' };
      }),
      del: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
    };

    const service = new MatchmakingService(new MatchmakingRepository(), statsService, new BotFallbackService(), 30, { redis, io });

    await service.runMatchmakingTick(20_000);

    expect(redis.eval).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(expect.stringMatching(/^session:online-/), expect.any(String));
    expect(io.to).toHaveBeenCalledWith('user:1');
    expect(io.to).toHaveBeenCalledWith('user:2');
    expect(emit).toHaveBeenCalledWith('matchmaking:matched', expect.objectContaining({ revealAfterGame: false }));
  });

  it('tryMatch consumes pending assignment from redis once', async () => {
    const assignment = {
      matchId: 'online-xyz',
      playerA: { userId: 1, username: 'a', boardSize: 8, skillBand: 2, joinedAt: 1, socketId: 'x', queueJoinId: 'q1' },
      playerB: { userId: 2, username: 'b', boardSize: 8, skillBand: 2, joinedAt: 2, socketId: 'y', queueJoinId: 'q2' },
      opponentType: 'HUMAN' as const,
      revealAfterGame: false,
    };
    const redis = {
      zAdd: vi.fn().mockResolvedValue(1),
      zRem: vi.fn().mockResolvedValue(1),
      zRange: vi.fn().mockResolvedValue([]),
      hSet: vi.fn().mockResolvedValue(1),
      hGetAll: vi.fn().mockResolvedValue({}),
      del: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValueOnce(JSON.stringify(assignment)).mockResolvedValueOnce(null),
    };

    const service = new MatchmakingService(new MatchmakingRepository(), statsService, new BotFallbackService(), 30, { redis });

    const first = await service.tryMatch(1);
    const second = await service.tryMatch(1);

    expect(first?.matchId).toBe('online-xyz');
    expect(second).toBeNull();
    expect(redis.del).toHaveBeenCalledWith('mm:assignment:1');
  });
});

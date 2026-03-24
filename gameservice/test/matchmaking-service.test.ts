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
});

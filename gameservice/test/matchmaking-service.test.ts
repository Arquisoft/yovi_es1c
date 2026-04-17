import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchmakingRepository } from '../src/repositories/MatchmakingRepository';
import { MatchmakingService } from '../src/services/MatchmakingService';
import { BotFallbackService } from '../src/services/BotFallbackService';
import { StatsService } from '../src/services/StatsService';
import { MatchRules } from '../src/types/rules';

const classic: MatchRules = {
  pieRule: { enabled: false },
  honey: { enabled: false, blockedCells: [] },
};

const pieOnly: MatchRules = {
  pieRule: { enabled: true },
  honey: { enabled: false, blockedCells: [] },
};

const honeyOnly: MatchRules = {
  pieRule: { enabled: false },
  honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
};

describe('MatchmakingService rules compatibility', () => {
  let repository: MatchmakingRepository;
  let statsService: StatsService;
  let service: MatchmakingService;

  beforeEach(() => {
    repository = new MatchmakingRepository();
    statsService = { getWinRateForUser: vi.fn().mockResolvedValue(50) } as unknown as StatsService;
    service = new MatchmakingService(repository, statsService, new BotFallbackService(), 30);
  });

  it.each([
    { label: 'classic vs classic', first: classic, second: classic, shouldMatch: true },
    { label: 'pie-only vs pie-only', first: pieOnly, second: pieOnly, shouldMatch: true },
    { label: 'honey-only vs honey-only', first: honeyOnly, second: honeyOnly, shouldMatch: true },
    { label: 'classic vs pie-only', first: classic, second: pieOnly, shouldMatch: false },
    { label: 'classic vs honey-only', first: classic, second: honeyOnly, shouldMatch: false },
  ])('enforces compatibility for $label', async ({ first, second, shouldMatch }) => {
    const playerA = await service.joinQueue({
      userId: 1,
      username: 'alice',
      boardSize: 8,
      rules: first,
      socketId: 'sock-1',
    });
    await service.joinQueue({
      userId: 2,
      username: 'bob',
      boardSize: 8,
      rules: second,
      socketId: 'sock-2',
    });

    await service.runMatchmakingTick(playerA.joinedAt + 5_000);

    const assignmentA = await service.tryMatch(1);
    const assignmentB = await service.tryMatch(2);

    if (shouldMatch) {
      expect(assignmentA?.playerB?.userId).toBe(2);
      expect(assignmentB?.playerB?.userId).toBe(2);
      expect(assignmentA?.playerA.rules).toEqual(first);
      expect(assignmentA?.playerB?.rules).toEqual(second);
    } else {
      expect(assignmentA).toBeNull();
      expect(assignmentB).toBeNull();
    }
  });

  it('stores rules in redis-backed initial online session state', async () => {
    const memory = new Map<string, string>();
    const boards = new Set<string>();
    const queueMembers = new Map<string, string[]>();
    const redis = {
      zAdd: vi.fn(async (key: string, members: { score: number; value: string }[]) => {
        if (key === 'mm:boards') {
          members.forEach((member) => boards.add(member.value));
          return members.length;
        }
        const current = queueMembers.get(key) ?? [];
        members.forEach((member) => current.push(member.value));
        queueMembers.set(key, current);
        return members.length;
      }),
      zRem: vi.fn(async (key: string, members: string[]) => {
        const current = queueMembers.get(key) ?? [];
        queueMembers.set(key, current.filter((value) => !members.includes(value)));
        return members.length;
      }),
      zRange: vi.fn(async (key: string) => {
        if (key === 'mm:boards') return [...boards];
        return queueMembers.get(key) ?? [];
      }),
      hSet: vi.fn(async (key: string, values: Record<string, string>) => {
        memory.set(key, JSON.stringify(values));
        return 1;
      }),
      hGetAll: vi.fn(async (key: string) => {
        const raw = memory.get(key);
        return raw ? JSON.parse(raw) : {};
      }),
      del: vi.fn(async (_key: string) => 1),
      eval: vi.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
        const queueKey = options.keys[0];
        const current = queueMembers.get(queueKey) ?? [];
        const next = current.filter((value) => !options.arguments.includes(value));
        queueMembers.set(queueKey, next);
        options.arguments.forEach((value) => memory.delete(`mm:player:${value}`));
        return 1;
      }),
      set: vi.fn(async (key: string, value: string) => {
        memory.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => memory.get(key) ?? null),
    };

    const redisService = new MatchmakingService(
        new MatchmakingRepository(),
        statsService,
        new BotFallbackService(),
        30,
        { redis: redis as any },
    );

    const a = await redisService.joinQueue({
      userId: 11,
      username: 'neo',
      boardSize: 8,
      rules: pieOnly,
      socketId: 'sock-a',
    });
    await redisService.joinQueue({
      userId: 12,
      username: 'trinity',
      boardSize: 8,
      rules: pieOnly,
      socketId: 'sock-b',
    });

    await redisService.runMatchmakingTick(a.joinedAt + 1000);

    const firstSessionValue = [...memory.entries()].find(([key]) => key.startsWith('session:online:'))?.[1];
    expect(firstSessionValue).toBeTruthy();
    const parsed = JSON.parse(firstSessionValue as string);
    expect(parsed.rules).toEqual(pieOnly);
  });
});
import { randomUUID } from 'crypto';
import { MatchmakingRepository } from '../repositories/MatchmakingRepository';
import { BotFallbackService } from './BotFallbackService';
import { OnlineMatchAssignment, OnlineQueueEntry, OnlineSessionState } from '../types/online';
import { StatsService } from './StatsService';
import { matchmakingDuration, matchmakingEvents } from '../metrics';

export interface RedisCommandClient {
  zAdd(key: string, members: { score: number; value: string }[]): Promise<number>;
  zRem(key: string, members: string[]): Promise<number>;
  zRange(key: string, start: number, stop: number): Promise<string[]>;
  hSet(key: string, values: Record<string, string>): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  del(key: string): Promise<number>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<number>;
  set(key: string, value: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
}


export interface SocketEmitter {
  to(room: string): { emit(event: string, payload: unknown): void };
}

interface MatchmakingDeps {
  redis?: RedisCommandClient;
  io?: SocketEmitter;
  workerIntervalMs?: number;
}

interface QueueScanResult {
  boardSize: number;
  players: OnlineQueueEntry[];
}

const ATOMIC_CLAIM_PAIR_LUA = `
local queueKey = KEYS[1]
local playerAHash = KEYS[2]
local playerBHash = KEYS[3]
local playerA = ARGV[1]
local playerB = ARGV[2]

if redis.call('zscore', queueKey, playerA) == false then return 0 end
if redis.call('zscore', queueKey, playerB) == false then return 0 end
if redis.call('exists', playerAHash) == 0 then return 0 end
if redis.call('exists', playerBHash) == 0 then return 0 end

redis.call('zrem', queueKey, playerA, playerB)
return 1
`;

export class MatchmakingService {
  private readonly workerIntervalMs: number;
  private workerTimer: NodeJS.Timeout | null = null;
  private readonly pendingAssignments = new Map<number, OnlineMatchAssignment>();

  constructor(
    private readonly repository: MatchmakingRepository,
    private readonly statsService: StatsService,
    private readonly botFallbackService: BotFallbackService,
    private readonly timeoutSec = 30,
    private readonly deps: MatchmakingDeps = {},
  ) {
    this.workerIntervalMs = deps.workerIntervalMs ?? 2_000;
  }

  async joinQueue(entry: Omit<OnlineQueueEntry, 'skillBand' | 'joinedAt' | 'queueJoinId'>): Promise<OnlineQueueEntry> {
    const winRate = await this.statsService.getWinRateForUser(entry.userId);
    const skillBand = this.getSkillBand(winRate);
    const queueEntry: OnlineQueueEntry = {
      ...entry,
      skillBand,
      joinedAt: Date.now(),
      queueJoinId: randomUUID(),
    };

    if (this.deps.redis) {
      await this.enqueueInRedis(queueEntry);
    } else {
      await this.repository.enqueue(queueEntry);
    }

    matchmakingEvents.inc({ event: 'queue', result: 'join' });
    return queueEntry;
  }

  async cancelQueue(userId: number): Promise<void> {
    if (this.deps.redis) {
      await this.removeFromRedisQueue(userId);
    } else {
      await this.repository.cancel(userId);
    }
    matchmakingEvents.inc({ event: 'queue', result: 'cancel' });
  }

  startWorker(): void {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      void this.runMatchmakingTick();
    }, this.workerIntervalMs);
  }

  stopWorker(): void {
    if (!this.workerTimer) return;
    clearInterval(this.workerTimer);
    this.workerTimer = null;
  }

  async runMatchmakingTick(now = Date.now()): Promise<void> {
    const queues = this.deps.redis ? await this.listRedisQueues() : [{ boardSize: 8, players: await this.repository.listByBoard(8) }];

    for (const queue of queues) {
      const sortedPlayers = queue.players.sort((a, b) => a.joinedAt - b.joinedAt);
      for (let index = 0; index < sortedPlayers.length; index += 1) {
        const assignment = await this.tryMatchCandidate(sortedPlayers[index], sortedPlayers, queue.boardSize, now);
        if (!assignment) continue;
        await this.persistInitialMatch(assignment, queue.boardSize);
        this.emitMatched(assignment);
      }
    }
  }

  async tryMatch(userId: number, now = Date.now()): Promise<OnlineMatchAssignment | null> {
    const pending = await this.consumePendingAssignment(userId);
    if (pending) return pending;

    const allCandidates = this.deps.redis ? (await this.listRedisQueueByBoard(8)) : await this.repository.listByBoard(8);
    const self = allCandidates.find((entry) => entry.userId === userId);
    if (!self) return null;
    return this.tryMatchCandidate(self, allCandidates, 8, now);
  }

  getBotDifficulty(winRate: number): 'easy' | 'medium' | 'hard' {
    return this.botFallbackService.chooseDifficulty(winRate);
  }

  private async tryMatchCandidate(
      self: OnlineQueueEntry,
      allCandidates: OnlineQueueEntry[],
      boardSize: number,
      now: number,
  ): Promise<OnlineMatchAssignment | null> {
    const waitedSec = (now - self.joinedAt) / 1000;
    const skillRange = waitedSec >= 20 ? 2 : waitedSec >= 10 ? 1 : 0;
    const rival = allCandidates.find(
        (entry) => entry.userId !== self.userId && Math.abs(entry.skillBand - self.skillBand) <= skillRange
    );

    if (rival) {
      const claimed = this.deps.redis
          ? await this.claimPairAtomicallyRedis(boardSize, self.userId, rival.userId)
          : await this.repository.claimPair(self, rival);

      if (!claimed) {
        matchmakingEvents.inc({ event: 'assignment', result: 'claim_conflict' });
        return null;
      }

      matchmakingDuration.observe(waitedSec);
      matchmakingEvents.inc({ event: 'assignment', result: 'human' });

      const assignment: OnlineMatchAssignment = {
        matchId: `online-${randomUUID()}`,
        playerA: self,
        playerB: rival,
        opponentType: 'HUMAN',
        revealAfterGame: false,
      };

      await this.storePendingAssignment(assignment);
      return assignment;
    }

    if (waitedSec >= this.timeoutSec) {
      await this.cancelQueue(self.userId);
      matchmakingDuration.observe(waitedSec);
      matchmakingEvents.inc({ event: 'assignment', result: 'bot_timeout' });

      return {
        matchId: `online-${randomUUID()}`,
        playerA: self,
        playerB: null,
        opponentType: 'BOT',
        revealAfterGame: true,
      };
    }

    return null;
  }

  private async enqueueInRedis(entry: OnlineQueueEntry): Promise<void> {
    const redis = this.deps.redis;
    if (!redis) return;

    const queueKey = this.getQueueKey(entry.boardSize);
    const playerKey = this.getPlayerKey(entry.userId);

    await redis.zAdd(queueKey, [{ score: entry.joinedAt, value: String(entry.userId) }]);
    await redis.hSet(playerKey, {
      userId: String(entry.userId),
      username: entry.username,
      boardSize: String(entry.boardSize),
      skillBand: String(entry.skillBand),
      joinedAt: String(entry.joinedAt),
      socketId: entry.socketId,
      queueJoinId: entry.queueJoinId,
    });
    await redis.zAdd('mm:boards', [{ score: entry.boardSize, value: String(entry.boardSize) }]);
  }

  private async listRedisQueues(): Promise<QueueScanResult[]> {
    const redis = this.deps.redis;
    if (!redis) return [];

    const boards = await redis.zRange('mm:boards', 0, -1);
    const results: QueueScanResult[] = [];

    for (const board of boards) {
      const boardSize = Number(board);
      if (!Number.isFinite(boardSize)) continue;
      const players = await this.listRedisQueueByBoard(boardSize);
      if (players.length > 0) {
        results.push({ boardSize, players });
      }
    }

    return results;
  }

  private async listRedisQueueByBoard(boardSize: number): Promise<OnlineQueueEntry[]> {
    const redis = this.deps.redis;
    if (!redis) return [];

    const userIds = await redis.zRange(this.getQueueKey(boardSize), 0, -1);
    const players = await Promise.all(userIds.map(async (userId) => this.readPlayerFromRedis(Number(userId))));
    return players.filter((entry): entry is OnlineQueueEntry => entry !== null);
  }

  private async readPlayerFromRedis(userId: number): Promise<OnlineQueueEntry | null> {
    const redis = this.deps.redis;
    if (!redis) return null;

    const data = await redis.hGetAll(this.getPlayerKey(userId));
    if (Object.keys(data).length === 0) return null;

    return {
      userId: Number(data.userId),
      username: data.username,
      boardSize: Number(data.boardSize),
      skillBand: Number(data.skillBand),
      joinedAt: Number(data.joinedAt),
      socketId: data.socketId,
      queueJoinId: data.queueJoinId,
    };
  }

  private async removeFromRedisQueue(userId: number): Promise<void> {
    const redis = this.deps.redis;
    if (!redis) return;

    const player = await this.readPlayerFromRedis(userId);
    if (!player) return;

    await redis.zRem(this.getQueueKey(player.boardSize), [String(userId)]);
    await redis.del(this.getPlayerKey(userId));
  }

  // Este EVAL evita race conditions en entornos multi-instancia: la comprobación de existencia
  // y el remove de ambos usuarios en la cola ocurre de forma atómica dentro de Redis.
  private async claimPairAtomicallyRedis(boardSize: number, playerAId: number, playerBId: number): Promise<boolean> {
    const redis = this.deps.redis;
    if (!redis) return false;

    const result = await redis.eval(ATOMIC_CLAIM_PAIR_LUA, {
      keys: [this.getQueueKey(boardSize), this.getPlayerKey(playerAId), this.getPlayerKey(playerBId)],
      arguments: [String(playerAId), String(playerBId)],
    });

    return result === 1;
  }

  private async persistInitialMatch(assignment: OnlineMatchAssignment, boardSize: number): Promise<void> {
    const redis = this.deps.redis;
    if (!redis || !assignment.playerB) return;

    const layout = Array.from({ length: boardSize }, (_, idx) => '.'.repeat(idx + 1)).join('/');
    const initial: OnlineSessionState = {
      matchId: assignment.matchId,
      layout,
      size: boardSize,
      turn: 0,
      version: 0,
      timerEndsAt: Date.now() + 25_000,
      players: [
        { userId: assignment.playerA.userId, username: assignment.playerA.username, symbol: 'B' },
        { userId: assignment.playerB.userId, username: assignment.playerB.username, symbol: 'R' },
      ],
      opponentType: 'HUMAN',
      connection: {
        [assignment.playerA.userId]: 'CONNECTED',
        [assignment.playerB.userId]: 'CONNECTED',
      },
      reconnectDeadline: {
        [assignment.playerA.userId]: null,
        [assignment.playerB.userId]: null,
      },
      winner: null,
      messages: [],
    };

    await redis.set(`session:${assignment.matchId}`, JSON.stringify(initial));
  }

  private emitMatched(assignment: OnlineMatchAssignment): void {
    if (!this.deps.io || !assignment.playerB) return;

    this.deps.io.to(`user:${assignment.playerA.userId}`).emit('matchmaking:matched', {
      matchId: assignment.matchId,
      opponentPublic: { username: assignment.playerB.username },
      revealAfterGame: assignment.revealAfterGame,
    });

    this.deps.io.to(`user:${assignment.playerB.userId}`).emit('matchmaking:matched', {
      matchId: assignment.matchId,
      opponentPublic: { username: assignment.playerA.username },
      revealAfterGame: assignment.revealAfterGame,
    });
  }


  private async storePendingAssignment(assignment: OnlineMatchAssignment): Promise<void> {
    if (!assignment.playerB) return;

    if (this.deps.redis) {
      const raw = JSON.stringify(assignment);
      await this.deps.redis.set(this.getAssignmentKey(assignment.playerA.userId), raw);
      await this.deps.redis.set(this.getAssignmentKey(assignment.playerB.userId), raw);
      return;
    }

    this.pendingAssignments.set(assignment.playerA.userId, assignment);
    this.pendingAssignments.set(assignment.playerB.userId, assignment);
  }

  private async consumePendingAssignment(userId: number): Promise<OnlineMatchAssignment | null> {
    if (this.deps.redis) {
      const key = this.getAssignmentKey(userId);
      const raw = await this.deps.redis.get(key);
      if (!raw) return null;
      await this.deps.redis.del(key);
      return JSON.parse(raw) as OnlineMatchAssignment;
    }

    const assignment = this.pendingAssignments.get(userId) ?? null;
    if (!assignment) return null;
    this.pendingAssignments.delete(userId);
    return assignment;
  }

  private getSkillBand(winRate: number): number {
    if (winRate <= 30) return 0;
    if (winRate <= 45) return 1;
    if (winRate <= 60) return 2;
    if (winRate <= 75) return 3;
    return 4;
  }

  private getQueueKey(boardSize: number): string {
    return `mm:queue:${boardSize}`;
  }

  private getPlayerKey(userId: number): string {
    return `mm:player:${userId}`;
  }

  private getAssignmentKey(userId: number): string {
    return `mm:assignment:${userId}`;
  }
}

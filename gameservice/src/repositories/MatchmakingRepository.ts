import { OnlineQueueEntry } from '../types/online';

const CLAIM_MATCH_LUA = `
if redis.call('zscore', KEYS[1], ARGV[1]) and redis.call('zscore', KEYS[1], ARGV[2]) then
  if redis.call('sismember', KEYS[2], ARGV[1]) == 0 and redis.call('sismember', KEYS[2], ARGV[2]) == 0 then
    redis.call('sadd', KEYS[2], ARGV[1], ARGV[2])
    redis.call('zrem', KEYS[1], ARGV[1], ARGV[2])
    return 1
  end
end
return 0
`;

export interface RedisLikeClient {
  eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<number>;
}

export class MatchmakingRepository {
  private queue = new Map<number, OnlineQueueEntry>();
  private claimed = new Set<number>();

  constructor(private readonly redisClient?: RedisLikeClient) {}

  async enqueue(entry: OnlineQueueEntry): Promise<void> {
    this.queue.set(entry.userId, entry);
  }

  async cancel(userId: number): Promise<void> {
    this.queue.delete(userId);
    this.claimed.delete(userId);
  }

  async listByBoard(boardSize: number): Promise<OnlineQueueEntry[]> {
    return [...this.queue.values()]
      .filter((entry) => entry.boardSize === boardSize && !this.claimed.has(entry.userId))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async claimPair(playerA: OnlineQueueEntry, playerB: OnlineQueueEntry): Promise<boolean> {
    if (this.redisClient?.eval) {
      const result = await this.redisClient.eval(CLAIM_MATCH_LUA, {
        keys: ['matchmaking:queue', 'matchmaking:claimed'],
        arguments: [String(playerA.userId), String(playerB.userId)],
      });
      if (result === 1) {
        this.claimed.add(playerA.userId);
        this.claimed.add(playerB.userId);
        this.queue.delete(playerA.userId);
        this.queue.delete(playerB.userId);
        return true;
      }
      return false;
    }

    if (this.claimed.has(playerA.userId) || this.claimed.has(playerB.userId)) {
      return false;
    }
    if (!this.queue.has(playerA.userId) || !this.queue.has(playerB.userId)) {
      return false;
    }

    this.claimed.add(playerA.userId);
    this.claimed.add(playerB.userId);
    this.queue.delete(playerA.userId);
    this.queue.delete(playerB.userId);
    return true;
  }

  getClaimLuaScript(): string {
    return CLAIM_MATCH_LUA;
  }
}

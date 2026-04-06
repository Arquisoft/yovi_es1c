import { StatsRepository } from "../repositories/StatsRepository";
import { StatsDto, MatchDto } from "../types/stats";

const DEFAULT_HISTORY_LIMIT = 20;

function mapWinnerToStatus(winner: string | null): MatchDto['status'] {
  if (winner === 'USER') return 'win';
  return 'lose';
}

function toUtcIsoString(sqliteDate: string): string {
  return sqliteDate.includes('T')
    ? sqliteDate
    : sqliteDate.replace(' ', 'T') + 'Z';
}

export class StatsService {
  constructor(private readonly statsRepo: StatsRepository) {}

  async getStats(userId: number) {
    return this.statsRepo.getUserStats(userId);
  }

  async getWinRateForUser(userId: number): Promise<number> {
    const stats = await this.statsRepo.getUserStats(userId);
    return stats?.win_rate ?? 0;
  }

  async getFullStats(userId: number): Promise<StatsDto> {
    const [raw, history] = await Promise.all([
      this.statsRepo.getUserStats(userId),
      this.statsRepo.getMatchHistory(userId, DEFAULT_HISTORY_LIMIT),
    ]);

    const matches: MatchDto[] = history.map((row) => ({
      matchId: String(row.id),
      createdAt: toUtcIsoString(row.created_at),
      mode: row.mode,
      status: mapWinnerToStatus(row.winner),
    }));

    return {
      totalMatches: raw?.total_games ?? 0,
      wins:         raw?.wins        ?? 0,
      losses:       raw?.losses      ?? 0,
      matches,
    };
  }
}

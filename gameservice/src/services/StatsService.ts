import { StatsRepository } from "../repositories/StatsRepository";

export class StatsService {
  constructor(private statsRepo: StatsRepository) {}

  async getStats(userId: number) {
    return this.statsRepo.getUserStats(userId);
  }
  async getWinRateForUser(userId: number): Promise<number> {
    const stats = await this.statsRepo.getUserStats(userId);
    return stats?.win_rate ?? 0;
  }
}
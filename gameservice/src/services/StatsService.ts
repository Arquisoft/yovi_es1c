import { StatsRepository } from "../repositories/StatsRepository";

export class StatsService {
  constructor(private statsRepo: StatsRepository) {}

  async getStats(userId: number) {
    return this.statsRepo.getUserStats(userId);
  }
}
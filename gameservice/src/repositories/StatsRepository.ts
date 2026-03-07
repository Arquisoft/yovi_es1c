import { Database } from "sqlite";

export class StatsRepository {
  constructor(private db: Database) {}

  async getUserStats(userId: number) {
    return this.db.get(`SELECT * FROM user_stats WHERE user_id = ?`, [userId]);
  }
}
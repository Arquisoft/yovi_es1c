import { Database } from "sqlite";

export interface MatchRow {
  id: number;
  board_size: number;
  difficulty: string;
  status: string;
  winner: string | null;
  mode: string;
  created_at: string;
}

export class StatsRepository {
  constructor(private db: Database) {}

  async getUserStats(userId: number) {
    return this.db.get(`SELECT * FROM user_stats WHERE user_id = ?`, [userId]);
  }

  async getMatchHistory(userId: number, limit: number): Promise<MatchRow[]> {
    return this.db.all<MatchRow[]>(
      `SELECT id, board_size, difficulty, status, winner, mode, created_at
       FROM matches
       WHERE user_id = ? AND status = 'FINISHED'
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    );
  }
}
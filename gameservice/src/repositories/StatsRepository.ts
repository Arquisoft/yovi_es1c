import { Pool } from 'pg';

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
  constructor(private readonly db: Pool) {}

  async getUserStats(userId: number) {
    const result = await this.db.query(`SELECT * FROM user_stats WHERE user_id = $1`, [userId]);
    return result.rows[0] ?? null;
  }

  async getMatchHistory(userId: number, limit: number): Promise<MatchRow[]> {
    const result = await this.db.query<MatchRow>(
        `SELECT id, board_size, difficulty, status, winner, mode, created_at
         FROM matches
         WHERE user_id = $1 AND status = 'FINISHED'
         ORDER BY created_at DESC
           LIMIT $2`,
        [userId, limit],
    );

    return result.rows;
  }
}
import { Pool } from 'pg';

export class MatchRepository {
  constructor(private readonly db: Pool) {}

  async createMatch(userId: number, boardSize: number, difficulty: string, mode: string = 'BOT') {
    const result = await this.db.query(
        `INSERT INTO matches (user_id, board_size, difficulty, status, mode)
         VALUES ($1, $2, $3, 'ONGOING', $4)
           RETURNING id`,
        [userId, boardSize, difficulty, mode],
    );

    return result.rows[0].id;
  }

  async getMatchById(id: number) {
    const result = await this.db.query(`SELECT * FROM matches WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async addMove(matchId: number, position: string, player: string, moveNumber: number) {
    await this.db.query(
        `INSERT INTO moves (match_id, position_yen, player, move_number)
         VALUES ($1, $2, $3, $4)`,
        [matchId, position, player, moveNumber],
    );
  }

  async listMoves(matchId: number) {
    const result = await this.db.query(
        `SELECT id, match_id, position_yen, player, move_number, "timestamp"
         FROM moves
         WHERE match_id = $1
         ORDER BY move_number ASC`,
        [matchId],
    );
    return result.rows;
  }

  async finishMatch(matchId: number, winner: string) {
    await this.db.query(
        `UPDATE matches SET status = 'FINISHED', winner = $1 WHERE id = $2`,
        [winner, matchId],
    );
  }
}
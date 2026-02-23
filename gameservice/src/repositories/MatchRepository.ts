import { Database } from "sqlite";

export class MatchRepository {
  constructor(private db: Database) {}

  async createMatch(userId: number, boardSize: number, strategy: string, difficulty: string) {
    const result = await this.db.run(
      `INSERT INTO matches (user_id, board_size, strategy, difficulty) 
       VALUES (?, ?, ?, ?)`,
      [userId, boardSize, strategy, difficulty]
    );

    return result.lastID;
  }

  async getMatchById(id: number) {
    return this.db.get(`SELECT * FROM matches WHERE id = ?`, [id]);
  }

  async addMove(matchId: number, position: string, player: string, moveNumber: number) {
    await this.db.run(
      `INSERT INTO moves (match_id, position_yen, player, move_number)
       VALUES (?, ?, ?, ?)`,
      [matchId, position, player, moveNumber]
    );
  }

  async finishMatch(matchId: number, winner: string) {
    await this.db.run(
      `UPDATE matches SET status = 'FINISHED', winner = ? WHERE id = ?`,
      [winner, matchId]
    );
  }
}
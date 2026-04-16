import { Pool } from 'pg';
import type { PlayerRanking } from '../types/ranking';

export interface RatingChange {
    userId: number;
    matchId: number;
    ratingBefore: number;
    ratingAfter: number;
    delta: number;
    gamesPlayedAfter: number;
    peakRating: number;
}

export class RankingRepository {
    constructor(private readonly db: Pool) {}

    async getByUserId(userId: number): Promise<PlayerRanking | null> {
        const result = await this.db.query<PlayerRanking>(
            `SELECT user_id, elo_rating, games_played, peak_rating, last_updated
             FROM player_rankings
             WHERE user_id = $1`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    async applyRatingChange(change: RatingChange): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `INSERT INTO player_rankings (user_id, elo_rating, games_played, peak_rating, last_updated)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                     elo_rating   = EXCLUDED.elo_rating,
                     games_played = EXCLUDED.games_played,
                     peak_rating  = EXCLUDED.peak_rating,
                     last_updated = NOW()`,
                [change.userId, change.ratingAfter, change.gamesPlayedAfter, change.peakRating],
            );

            await client.query(
                `INSERT INTO ranking_history (user_id, match_id, rating_before, rating_after, delta)
                 VALUES ($1, $2, $3, $4, $5)`,
                [change.userId, change.matchId, change.ratingBefore, change.ratingAfter, change.delta],
            );

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

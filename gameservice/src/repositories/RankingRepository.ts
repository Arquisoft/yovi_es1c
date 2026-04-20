import { Pool } from 'pg';
import type { LeaderboardEntry, PlayerRanking, UserRankingDto } from '../types/ranking';

export interface RatingChange {
    userId: number;
    username?: string;
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
            `SELECT user_id, username, elo_rating, games_played, peak_rating, last_updated
             FROM player_rankings
             WHERE user_id = $1`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    async getLeaderboard(limit: number, offset: number): Promise<LeaderboardEntry[]> {
        const result = await this.db.query<{
            user_id: number;
            username: string | null;
            elo_rating: number;
            games_played: number;
            peak_rating: number;
            last_updated: string;
            rank: string;
        }>(
            `SELECT
                 user_id,
                 username,
                 elo_rating,
                 games_played,
                 peak_rating,
                 last_updated,
                 RANK() OVER (ORDER BY elo_rating DESC, games_played DESC, user_id ASC) AS rank
             FROM player_rankings
             ORDER BY elo_rating DESC, games_played DESC, user_id ASC
             LIMIT $1 OFFSET $2`,
            [limit, offset],
        );

        return result.rows.map((row) => ({
            rank: Number(row.rank),
            userId: row.user_id,
            username: row.username,
            eloRating: row.elo_rating,
            gamesPlayed: row.games_played,
            peakRating: row.peak_rating,
            lastUpdated: row.last_updated,
        }));
    }

    async getTotalRankedPlayers(): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM player_rankings`,
        );
        return Number(result.rows[0]?.count ?? 0);
    }

    async getUserRanking(userId: number): Promise<UserRankingDto | null> {
        const result = await this.db.query<{
            user_id: number;
            username: string | null;
            elo_rating: number;
            games_played: number;
            peak_rating: number;
            last_updated: string;
            rank: string;
        }>(
            `WITH ranked AS (
                 SELECT
                     user_id,
                     username,
                     elo_rating,
                     games_played,
                     peak_rating,
                     last_updated,
                     RANK() OVER (ORDER BY elo_rating DESC, games_played DESC, user_id ASC) AS rank
                 FROM player_rankings
             )
             SELECT * FROM ranked WHERE user_id = $1`,
            [userId],
        );

        const row = result.rows[0];
        if (!row) return null;
        return {
            rank: Number(row.rank),
            userId: row.user_id,
            username: row.username,
            eloRating: row.elo_rating,
            gamesPlayed: row.games_played,
            peakRating: row.peak_rating,
            lastUpdated: row.last_updated,
        };
    }

    async applyRatingChange(change: RatingChange): Promise<void> {
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `INSERT INTO player_rankings (user_id, username, elo_rating, games_played, peak_rating, last_updated)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                     username     = COALESCE(EXCLUDED.username, player_rankings.username),
                     elo_rating   = EXCLUDED.elo_rating,
                     games_played = EXCLUDED.games_played,
                     peak_rating  = EXCLUDED.peak_rating,
                     last_updated = NOW()`,
                [change.userId, change.username ?? null, change.ratingAfter, change.gamesPlayedAfter, change.peakRating],
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

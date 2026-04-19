import { RankingRepository } from '../repositories/RankingRepository';
import type {
    LeaderboardResponse,
    MatchDifficulty,
    MatchResult,
    RankingUpdateInput,
    RankingUpdateOutcome,
    UserRankingDto,
} from '../types/ranking';

const DEFAULT_RATING = 1200;
const K_NEW = 40;
const K_STABLE = 20;
const NEW_PLAYER_GAMES_THRESHOLD = 30;

const BOT_RATING_BY_DIFFICULTY: Record<MatchDifficulty, number> = {
    easy: 1000,
    medium: 1300,
    hard: 1600,
    expert: 1900,
};

export class RankingService {
    constructor(private readonly rankingRepo: RankingRepository) {}

    calculateNewRating(
        currentRating: number,
        opponentRating: number,
        result: MatchResult,
        kFactor: number,
    ): number {
        const expected = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400));
        const actual = result === 'WIN' ? 1 : 0;
        return Math.round(currentRating + kFactor * (actual - expected));
    }

    getKFactor(gamesPlayed: number): number {
        return gamesPlayed < NEW_PLAYER_GAMES_THRESHOLD ? K_NEW : K_STABLE;
    }

    getOpponentRatingForBot(difficulty: MatchDifficulty): number {
        return BOT_RATING_BY_DIFFICULTY[difficulty];
    }

    async getOpponentRatingForUser(userId: number): Promise<number> {
        const ranking = await this.rankingRepo.getByUserId(userId);
        return ranking?.elo_rating ?? DEFAULT_RATING;
    }

    async getLeaderboard(limit: number, offset: number): Promise<LeaderboardResponse> {
        const [entries, total] = await Promise.all([
            this.rankingRepo.getLeaderboard(limit, offset),
            this.rankingRepo.getTotalRankedPlayers(),
        ]);
        return { total, limit, offset, entries };
    }

    async getUserRanking(userId: number): Promise<UserRankingDto | null> {
        return this.rankingRepo.getUserRanking(userId);
    }

    async applyRatingUpdate(input: RankingUpdateInput): Promise<RankingUpdateOutcome | null> {
        if (input.mode === 'LOCAL_2P') {
            return null;
        }

        const opponentRating = this.resolveOpponentRating(input);

        const current = (await this.rankingRepo.getByUserId(input.userId)) ?? {
            user_id: input.userId,
            elo_rating: DEFAULT_RATING,
            games_played: 0,
            peak_rating: DEFAULT_RATING,
            last_updated: '',
        };

        const kFactor = this.getKFactor(current.games_played);
        const newRating = this.calculateNewRating(
            current.elo_rating,
            opponentRating,
            input.result,
            kFactor,
        );
        const delta = newRating - current.elo_rating;

        await this.rankingRepo.applyRatingChange({
            userId: input.userId,
            matchId: input.matchId,
            ratingBefore: current.elo_rating,
            ratingAfter: newRating,
            delta,
            gamesPlayedAfter: current.games_played + 1,
            peakRating: Math.max(current.peak_rating, newRating),
        });

        return {
            ratingBefore: current.elo_rating,
            ratingAfter: newRating,
            delta,
        };
    }

    private resolveOpponentRating(input: RankingUpdateInput): number {
        if (input.mode === 'BOT') {
            if (!input.difficulty) {
                throw new Error('BOT matches require a difficulty to compute ranking');
            }
            return this.getOpponentRatingForBot(input.difficulty);
        }
        if (typeof input.opponentRating !== 'number') {
            throw new Error('ONLINE matches require opponentRating to compute ranking');
        }
        return input.opponentRating;
    }
}

export type MatchMode = 'BOT' | 'ONLINE' | 'LOCAL_2P';
export type MatchDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type MatchResult = 'WIN' | 'LOSS';

export interface PlayerRanking {
    user_id: number;
    elo_rating: number;
    games_played: number;
    peak_rating: number;
    last_updated: string;
}

export interface RankingUpdateInput {
    userId: number;
    matchId: number;
    mode: MatchMode;
    result: MatchResult;
    // required when mode === 'BOT'
    difficulty?: MatchDifficulty;
    // required when mode === 'ONLINE'
    opponentRating?: number;
}

export interface RankingUpdateOutcome {
    ratingBefore: number;
    ratingAfter: number;
    delta: number;
}

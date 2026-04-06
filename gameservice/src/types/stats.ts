export interface MatchDto {
  matchId: string;
  createdAt: string;
  mode: string;
  status: 'win' | 'lose';
}

export interface StatsDto {
  totalMatches: number;
  wins: number;
  losses: number;
  matches: MatchDto[];
}

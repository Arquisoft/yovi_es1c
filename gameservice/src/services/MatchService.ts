import { MatchRepository } from "../repositories/MatchRepository";

export class MatchService {
  constructor(private matchRepo: MatchRepository) {}

  async createMatch(userId: number, boardSize: number, strategy: string, difficulty: string) {
    return this.matchRepo.createMatch(userId, boardSize, strategy, difficulty);
  }

  async getMatch(id: number) {
    return this.matchRepo.getMatchById(id);
  }

  async addMove(matchId: number, position: string, player: string, moveNumber: number) {
    return this.matchRepo.addMove(matchId, position, player, moveNumber);
  }

  async finishMatch(matchId: number, winner: string) {
    return this.matchRepo.finishMatch(matchId, winner);
  }
}
import { MatchRepository } from "../repositories/MatchRepository";
import { gamesCreated, activeGames, gamesFinished } from '../metrics';

export class MatchService {
  constructor(private matchRepo: MatchRepository) {}

  async createMatch(userId: number, boardSize: number, difficulty: string, mode: string = 'BOT') {
    const match = await this.matchRepo.createMatch(userId, boardSize, difficulty, mode);
    gamesCreated.inc();
    activeGames.inc();
    return match;
  }

  async getMatch(id: number) {
    return this.matchRepo.getMatchById(id);
  }

  async addMove(matchId: number, position: string, player: string, moveNumber: number) {
    return this.matchRepo.addMove(matchId, position, player, moveNumber);
  }

  async finishMatch(matchId: number, winner: string) {
    const result = await this.matchRepo.finishMatch(matchId, winner);
    gamesFinished.inc({ winner });
    activeGames.dec();
    return result;
  }
}
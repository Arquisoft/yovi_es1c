import { MatchRepository } from "../repositories/MatchRepository";
import { gamesCreated, activeGames, gamesFinished } from '../metrics';

type MatchMove = {
  position_yen: string;
  player: 'USER' | 'BOT';
  move_number: number;
};

export class MatchService {
  private readonly botStatus = new Map<number, 'processing' | 'done'>();
  private readonly botTasks = new Map<number, Promise<void>>();

  constructor(private readonly matchRepo: MatchRepository) {}

  async createMatch(userId: number, boardSize: number, difficulty: string, mode: string = 'BOT') {
    const match = await this.matchRepo.createMatch(userId, boardSize, difficulty, mode);
    gamesCreated.inc();
    activeGames.inc();
    return match;
  }

  async getMatch(id: number) {
    return this.matchRepo.getMatchById(id);
  }

  async getMatchState(id: number) {
    const match = await this.matchRepo.getMatchById(id);
    if (!match) return null;

    const moves = await this.matchRepo.listMoves(id) as MatchMove[];
    return {
      ...match,
      moves,
      board: this.buildBoard(match.board_size, moves),
      botStatus: this.botStatus.get(id) ?? 'done',
    };
  }

  async addMove(matchId: number, position: string, player: string, moveNumber: number) {
    return this.matchRepo.addMove(matchId, position, player, moveNumber);
  }

  queueBotMove(matchId: number) {
    if (this.botTasks.has(matchId)) return;

    this.botStatus.set(matchId, 'processing');
    const task = this.applyBotMove(matchId)
        .catch((error) => {
          console.error(`Failed to apply bot move for match ${matchId}`, error);
        })
        .finally(() => {
          this.botStatus.set(matchId, 'done');
          this.botTasks.delete(matchId);
        });

    this.botTasks.set(matchId, task);
  }

  async finishMatch(matchId: number, winner: string) {
    const result = await this.matchRepo.finishMatch(matchId, winner);
    gamesFinished.inc({ winner });
    activeGames.dec();
    return result;
  }

  private async applyBotMove(matchId: number) {
    const match = await this.matchRepo.getMatchById(matchId);
    if (!match || match.status !== 'ONGOING') return;

    const moves = await this.matchRepo.listMoves(matchId) as MatchMove[];
    const move = await this.getBotMoveWithTimeout(matchId, match.board_size, moves);
    const fallbackMove = this.pickFallbackMove(match.board_size, moves);
    const chosen = move && !moves.some((existing) => existing.position_yen === move) ? move : fallbackMove;
    if (!chosen) return;

    const nextMoveNumber = Math.max(0, ...moves.map((entry) => entry.move_number)) + 1;
    await this.matchRepo.addMove(matchId, chosen, 'BOT', nextMoveNumber);
  }

  private async getBotMoveWithTimeout(matchId: number, boardSize: number, moves: MatchMove[]): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const baseUrl = process.env.GAMEY_SERVICE_URL

    try {
      const response = await fetch(`${baseUrl}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, boardSize, moves }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const payload = await response.json() as { position?: unknown; position_yen?: unknown; move?: unknown };
      const position = payload.position_yen ?? payload.position ?? payload.move;
      return typeof position === 'string' ? position : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private pickFallbackMove(boardSize: number, moves: MatchMove[]) {
    const occupied = new Set(moves.map((move) => move.position_yen));
    for (let row = 1; row <= boardSize; row += 1) {
      for (let col = 0; col < boardSize; col += 1) {
        const position = `${String.fromCodePoint(97 + col)}${row}`;
        if (!occupied.has(position)) return position;
      }
    }
    return null;
  }

  private buildBoard(boardSize: number, moves: MatchMove[]) {
    const board = Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => '.'));
    for (const move of moves) {
      const parsed = /^([a-z])(\d+)$/.exec(move.position_yen.trim().toLowerCase());
      if (!parsed) continue;
      const col = parsed[1].codePointAt(0)! - 97;
      const row = Number(parsed[2]) - 1;
      if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
        board[row][col] = move.player === 'BOT' ? 'B' : 'U';
      }
    }
    return board;
  }
}
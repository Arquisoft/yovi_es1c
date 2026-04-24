import { MatchRepository } from "../repositories/MatchRepository";
import { RankingService } from "./RankingService";
import { activeGames, botMoveDuration, gamesCreated, gamesFinished } from '../metrics';
import { cloneDefaultMatchRules, MatchRules, normalizeMatchRules, resolveRulesForMatch } from "../types/rules.js";
import type { MatchDifficulty, MatchMode } from "../types/ranking";

type MatchMove = {
  position_yen: string;
  player: 'USER' | 'BOT';
  move_number: number;
};

type YenPosition = {
  size: number;
  turn: number;
  players: ['B', 'R'];
  layout: string;
  rules?: MatchRules;
};

type BotPlayResponse = {
  position?: unknown;
  position_yen?: unknown;
  move?: unknown;
};

const DEFAULT_GAMEY_TIMEOUT_MS = 3500;

function resolveGameyTimeoutMs(): number {
  const configured = Number(process.env.GAMESERVICE_GAMEY_TIMEOUT_MS ?? DEFAULT_GAMEY_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_GAMEY_TIMEOUT_MS;
  }
  return Math.floor(configured);
}

export class MatchService {
  private readonly botStatus = new Map<number, 'processing' | 'done'>();
  private readonly botTasks = new Map<number, Promise<void>>();
  private readonly gameyTimeoutMs = resolveGameyTimeoutMs();

  constructor(
      private readonly matchRepo: MatchRepository,
      private readonly rankingService?: RankingService,
  ) {}

  async createMatch(
      userId: number,
      boardSize: number,
      difficulty: string,
      mode: string = 'BOT',
      rules: MatchRules = cloneDefaultMatchRules(),
  ) {
    const resolvedRules = resolveRulesForMatch(boardSize, rules);
    const match = await this.matchRepo.createMatch(userId, boardSize, difficulty, mode, resolvedRules);
    gamesCreated.inc({ mode });
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
    const layout = this.resolveCurrentLayout(match.board_size, moves);
    return {
      ...match,
      moves,
      layout,
      board: this.buildBoard(match.board_size, layout),
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

  async finishMatch(matchId: number, winner: string, opponentUserId?: number, username?: string) {
    const result = await this.matchRepo.finishMatch(matchId, winner);
    gamesFinished.inc({ winner });
    activeGames.dec();

    await this.applyRankingSafely(matchId, winner, opponentUserId, username);

    return result;
  }

  private async applyRankingSafely(matchId: number, winner: string, opponentUserId?: number, username?: string) {
    if (!this.rankingService) return;
    try {
      const match = await this.matchRepo.getMatchById(matchId);
      if (!match) return;

      const mode = match.mode as MatchMode;
      if (mode === 'LOCAL_2P') return;

      const result: 'WIN' | 'LOSS' = winner === 'USER' ? 'WIN' : 'LOSS';

      let opponentRating: number | undefined;
      if (mode === 'ONLINE' && typeof opponentUserId === 'number') {
        opponentRating = await this.rankingService.getOpponentRatingForUser(opponentUserId);
      }

      await this.rankingService.applyRatingUpdate({
        userId: match.user_id,
        username,
        matchId,
        mode,
        result,
        difficulty: mode === 'BOT' ? (match.difficulty as MatchDifficulty) : undefined,
        opponentRating,
      });
    } catch (err) {
      console.error(`[MatchService] Ranking update failed for match ${matchId}:`, err);
    }
  }

  private async applyBotMove(matchId: number) {
    const match = await this.matchRepo.getMatchById(matchId);
    if (!match || match.status !== 'ONGOING') return;

    const rules = this.resolveMatchRules(match.rules);
    const moves = await this.matchRepo.listMoves(matchId) as MatchMove[];
    const currentLayout = this.resolveCurrentLayout(match.board_size, moves);
    const move = await this.getBotMoveWithTimeout(
        match.board_size,
        String(match.difficulty ?? 'easy'),
        currentLayout,
        rules,
    );
    const fallbackMove = this.pickFallbackLayout(match.board_size, currentLayout);
    const chosen = move && !moves.some((existing) => existing.position_yen === move) ? move : fallbackMove;
    if (!chosen) return;

    const nextMoveNumber = Math.max(0, ...moves.map((entry) => entry.move_number)) + 1;
    await this.matchRepo.addMove(matchId, chosen, 'BOT', nextMoveNumber);
  }

  private async getBotMoveWithTimeout(
      boardSize: number,
      difficulty: string,
      currentLayout: string,
      rules: MatchRules,
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.gameyTimeoutMs);
    const baseUrl = (process.env.GAMEY_SERVICE_URL ?? '').replace(/\/+$/, '');
    const stopTimer = botMoveDuration.startTimer();

    try {
      const response = await fetch(`${baseUrl}/v1/ybot/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: this.buildYenPosition(boardSize, currentLayout, rules),
          bot_id: difficulty.toLowerCase(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const payload = await response.json() as BotPlayResponse;
      return this.extractLayoutFromBotPayload(payload, boardSize, currentLayout);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      stopTimer();
    }
  }

  private resolveMatchRules(rawRules: unknown): MatchRules {
    if (typeof rawRules === 'string') {
      try {
        return normalizeMatchRules(JSON.parse(rawRules));
      } catch {
        return cloneDefaultMatchRules();
      }
    }
    return normalizeMatchRules(rawRules);
  }

  private resolveCurrentLayout(boardSize: number, moves: MatchMove[]): string {
    const orderedMoves = [...moves].sort((left, right) => left.move_number - right.move_number);
    const latestMove = orderedMoves.length > 0 ? orderedMoves[orderedMoves.length - 1] : undefined;
    const latestPosition = latestMove?.position_yen?.trim();
    if (latestPosition && this.isSerializedLayout(latestPosition, boardSize)) {
      return latestPosition;
    }

    let layout = this.buildEmptyLayout(boardSize);
    for (const move of orderedMoves) {
      const parsed = this.parseLegacyPosition(move.position_yen, boardSize);
      if (!parsed) continue;
      layout = this.setLayoutCell(
          layout,
          parsed.row,
          parsed.col,
          move.player === 'USER' ? 'B' : 'R',
      );
    }
    return layout;
  }

  private buildYenPosition(boardSize: number, layout: string, rules: MatchRules): YenPosition {
    return {
      size: boardSize,
      turn: this.countStones(layout) % 2,
      players: ['B', 'R'],
      layout,
      rules,
    };
  }

  private extractLayoutFromBotPayload(payload: BotPlayResponse, boardSize: number, currentLayout: string): string | null {
    const candidates = [payload.position, payload.position_yen, payload.move];
    for (const candidate of candidates) {
      const layout = this.normalizeReturnedLayout(candidate, boardSize, currentLayout);
      if (layout) return layout;
    }
    return null;
  }

  private normalizeReturnedLayout(candidate: unknown, boardSize: number, currentLayout: string): string | null {
    if (candidate && typeof candidate === 'object') {
      const maybeLayout = (candidate as { layout?: unknown }).layout;
      if (typeof maybeLayout === 'string' && this.isSerializedLayout(maybeLayout, boardSize)) {
        return maybeLayout;
      }
      return null;
    }

    if (typeof candidate !== 'string') return null;
    if (this.isSerializedLayout(candidate, boardSize)) return candidate;

    const parsed = this.parseLegacyPosition(candidate, boardSize);
    if (!parsed) return null;
    return this.setLayoutCell(currentLayout, parsed.row, parsed.col, this.nextSymbolForLayout(currentLayout));
  }

  private pickFallbackLayout(boardSize: number, currentLayout: string): string | null {
    const rows = currentLayout.split('/');
    const nextSymbol = this.nextSymbolForLayout(currentLayout);

    for (let row = 0; row < boardSize; row += 1) {
      for (let col = 0; col <= row; col += 1) {
        if (rows[row]?.[col] === '.') {
          return this.setLayoutCell(currentLayout, row, col, nextSymbol);
        }
      }
    }
    return null;
  }

  private buildBoard(boardSize: number, layout: string) {
    const rows = layout.split('/');
    return Array.from({ length: boardSize }, (_, rowIndex) =>
        Array.from({ length: boardSize }, (_, colIndex) =>
            colIndex <= rowIndex ? (rows[rowIndex]?.[colIndex] ?? '.') : '.',
        ),
    );
  }

  private buildEmptyLayout(boardSize: number): string {
    return Array.from({ length: boardSize }, (_, rowIndex) => '.'.repeat(rowIndex + 1)).join('/');
  }

  private isSerializedLayout(position: string, boardSize: number): boolean {
    const rows = position.split('/');
    if (rows.length !== boardSize) return false;
    return rows.every((row, rowIndex) =>
        row.length === rowIndex + 1 && /^[BR.]+$/.test(row),
    );
  }

  private parseLegacyPosition(position: string, boardSize: number): { row: number; col: number } | null {
    const parsed = /^([a-z])(\d+)$/.exec(position.trim().toLowerCase());
    if (!parsed) return null;

    const col = parsed[1].codePointAt(0)! - 97;
    const row = Number(parsed[2]) - 1;
    if (!Number.isInteger(row) || row < 0 || row >= boardSize) return null;
    if (col < 0 || col > row) return null;
    return { row, col };
  }

  private setLayoutCell(layout: string, row: number, col: number, symbol: 'B' | 'R'): string {
    const rows = layout.split('/');
    const chars = rows[row].split('');
    chars[col] = symbol;
    rows[row] = chars.join('');
    return rows.join('/');
  }

  private countStones(layout: string): number {
    return layout.split('').filter((cell) => cell === 'B' || cell === 'R').length;
  }

  private nextSymbolForLayout(layout: string): 'B' | 'R' {
    return this.countStones(layout) % 2 === 0 ? 'B' : 'R';
  }
}

import { SessionStatePayload } from '../realtime/events/session.events';
import { OnlineSessionRepository } from '../repositories/OnlineSessionRepository';
import { OnlineChatMessage, OnlineSessionState } from '../types/online';
import { cloneDefaultMatchRules, MatchRules, normalizeMatchRules, resolveRulesForMatch } from '../types/rules.js';
import { TurnTimerService } from './TurnTimerService';
import { MatchService } from './MatchService';
import {activeGames, onlineChatMessages, onlineMoveErrors, onlineMoves, onlineSessionEvents, reconnectEvents, turnTimeouts} from '../metrics';
import { randomFillSync } from 'crypto';
import { ChatFilter, ChatFilterError } from './ChatFilter';
export type MoveErrorCode =
    | 'VERSION_CONFLICT'
    | 'NOT_YOUR_TURN'
    | 'INVALID_MOVE'
    | 'SESSION_NOT_FOUND'
    | 'RECONNECT_EXPIRED'
    | 'SESSION_TERMINAL'
    | 'UNAUTHORIZED'
    | 'DUPLICATE_EVENT'
    | 'PIE_RULE_NOT_AVAILABLE';

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del(key: string): Promise<number>;
  zAdd?(key: string, members: { score: number; value: string }[]): Promise<number>;
  zRem?(key: string, members: string[]): Promise<number>;
  zRange?(key: string, start: number, stop: number): Promise<string[]>;
}

export interface SocketEmitter {
  to(room: string): { emit(event: string, payload: unknown): void };
}

interface SessionDeps {
  redis?: RedisSessionClient;
  io?: SocketEmitter;
}

export interface MoveCommand {
  row: number;
  col: number;
}

type TimeoutAction = { type: 'move'; move: MoveCommand } | { type: 'swap' };
const ONLINE_SESSION_INDEX_KEY = 'session:online:index';
const DEFAULT_SESSION_TTL_SEC = 3600;

function resolvePositiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export class OnlineSessionError extends Error {
  constructor(public readonly code: MoveErrorCode, message: string) {
    super(message);
  }
}

export class OnlineSessionService {
  private readonly matchLocks = new Map<string, Promise<void>>();
  private readonly resolvedLock = Promise.resolve();
  private readonly dedupeTtlMs = 60_000;
  private readonly dedupeTtlSec = Math.ceil(this.dedupeTtlMs / 1000);
  private readonly persistedSessions = new Set<string>();
  private readonly sessionTtlSec = resolvePositiveInteger(process.env.ONLINE_SESSION_TTL_SEC, DEFAULT_SESSION_TTL_SEC);
  private readonly chatFilter: ChatFilter;
  private maintenanceTimer: NodeJS.Timeout | null = null;

  constructor(
      private readonly repository: OnlineSessionRepository,
      private readonly timerService: TurnTimerService,
      private readonly turnTimeoutSec = 25,
      private readonly reconnectGraceSec = 60,
      private readonly deps: SessionDeps = {},
      private readonly matchService?: MatchService,
      chatFilter?: ChatFilter,
  ) {
    this.chatFilter = chatFilter ?? new ChatFilter();
  }

  async createSession(
      matchId: string,
      size: number,
      players: [{ userId: number; username: string }, { userId: number; username: string }],
      opponentType: 'HUMAN' | 'BOT',
      rules: MatchRules = cloneDefaultMatchRules(),
  ): Promise<OnlineSessionState> {
    const layout = Array.from({ length: size }, (_, idx) => '.'.repeat(idx + 1)).join('/');
    const state: OnlineSessionState = {
      matchId,
      size,
      layout,
      rules: resolveRulesForMatch(size, rules),
      turn: 0,
      version: 0,
      timerEndsAt: this.timerService.buildTimerEndsAt(this.turnTimeoutSec),
      players: [
        { ...players[0], symbol: 'B' },
        { ...players[1], symbol: 'R' },
      ],
      opponentType,
      status: 'active',
      closeReason: null,
      connection: {
        [players[0].userId]: 'CONNECTED',
        [players[1].userId]: 'CONNECTED',
      },
      reconnectDeadline: {
        [players[0].userId]: null,
        [players[1].userId]: null,
      },
      winner: null,
      messages: [],
    };

    await this.saveState(state);
    onlineSessionEvents.inc({ event: 'created' });
    return state;
  }

  async addChatMessage(matchId: string, userId: number, username: string, text: string): Promise<OnlineChatMessage> {
    const state = await this.getState(matchId);
    if (!state) {
      throw new OnlineSessionError('SESSION_NOT_FOUND', 'Session not found');
    }

    const isParticipant = state.players.some((player) => player.userId === userId);
    if (!isParticipant) {
      throw new OnlineSessionError('NOT_YOUR_TURN', 'User is not part of this session');
    }

    const normalizedText = text.trim();
    if (!normalizedText || normalizedText.length > 200) {
      throw new OnlineSessionError('INVALID_MOVE', 'Chat message must be between 1 and 200 characters');
    }

    let finalText: string;
    try {
      const result = await this.chatFilter.filter(normalizedText);
      if (result.wasFiltered) {
        console.warn(`[ChatFilter] Sanitized chat message for user ${userId} in match ${matchId}`);
      }
      if (result.toxicityScore !== undefined) {
        console.info(`[ChatFilter] Perspective score ${result.toxicityScore.toFixed(2)} for user ${userId} in match ${matchId}`);
      }
      finalText = result.sanitized;
    } catch (error) {
      if (error instanceof ChatFilterError) {
        console.warn(`[ChatFilter] Rejected message score=${error.score.toFixed(2)} for user ${userId} in match ${matchId}`);
        throw new OnlineSessionError('INVALID_MOVE', 'Message contains inappropriate content');
      }
      throw error;
    }

    const message: OnlineChatMessage = {
      userId,
      username,
      text: finalText,
      timestamp: Date.now(),
    };

    const nextMessages = [...(state.messages ?? []), message];
    if (nextMessages.length > 100) {
      nextMessages.shift();
    }

    const nextState: OnlineSessionState = {
      ...state,
      messages: nextMessages,
    };

    await this.saveState(nextState);
    onlineChatMessages.inc();

    this.deps.io?.to(matchId).emit('chat:message', {
      matchId,
      ...message,
    });

    return message;
  }

  async handleMove(matchId: string, userId: number, move: MoveCommand, expectedVersion: number): Promise<OnlineSessionState> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) {
        this.throwMoveError(matchId, userId, 'SESSION_NOT_FOUND', 'Session not found');
      }

      if (this.isTerminal(state)) {
        this.throwMoveError(matchId, userId, 'SESSION_TERMINAL', 'Session already finished');
      }

      if (expectedVersion !== state.version) {
        const error = new OnlineSessionError('VERSION_CONFLICT', 'Version mismatch');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        this.emitSessionState(state);
        throw error;
      }

      const currentPlayer = state.players[state.turn];
      if (currentPlayer.userId !== userId) {
        this.throwMoveError(matchId, userId, 'NOT_YOUR_TURN', 'Not your turn');
      }

      if (!this.isMoveValid(state, move)) {
        this.throwMoveError(matchId, userId, 'INVALID_MOVE', 'Invalid move for current board state');
      }

      const nextState = this.buildStateAfterMove(state, move, currentPlayer.symbol);

      await this.saveState(nextState);
      onlineMoves.inc();

      if (nextState.winner) {
        onlineSessionEvents.inc({ event: 'finished' });
        await this.persistOnlineResult(nextState, nextState.winner);
      }

      this.emitSessionState(nextState);
      return nextState;
    });
  }
  async handlePieSwap(matchId: string, userId: number, expectedVersion: number): Promise<OnlineSessionState> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) {
        this.throwMoveError(matchId, userId, 'SESSION_NOT_FOUND', 'Session not found', false);
      }

      if (this.isTerminal(state)) {
        this.throwMoveError(matchId, userId, 'SESSION_TERMINAL', 'Session already finished', false);
      }

      if (expectedVersion !== state.version) {
        const error = new OnlineSessionError('VERSION_CONFLICT', 'Version mismatch');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        this.emitSessionState(state);
        throw error;
      }

      const currentPlayer = state.players[state.turn];
      if (currentPlayer.userId !== userId) {
        this.throwMoveError(matchId, userId, 'NOT_YOUR_TURN', 'Not your turn');
      }

      if (!this.isPieSwapLegal(state)) {
        this.throwMoveError(
            matchId,
            userId,
            'PIE_RULE_NOT_AVAILABLE',
            'Pie Rule cannot be applied at this point',
            false,
        );
      }

      const nextState = this.buildPieSwapState(state);

      await this.saveState(nextState);
      onlineMoves.inc();
      this.emitSessionState(nextState);
      return nextState;
    });
  }

  async playMove(matchId: string, userId: number, row: number, col: number, expectedVersion: number): Promise<OnlineSessionState> {
    return this.handleMove(matchId, userId, { row, col }, expectedVersion);
  }

  async markDisconnected(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return null;
      if (this.isTerminal(state)) return state;
      if (!state.players.some((player) => player.userId === userId)) return state;

      const nextState: OnlineSessionState = {
        ...state,
        connection: {
          ...state.connection,
          [userId]: 'DISCONNECTED',
        },
        reconnectDeadline: {
          ...state.reconnectDeadline,
          [userId]: now + this.reconnectGraceSec * 1000,
        },
        status: 'waiting_reconnect',
        version: state.version + 1,
      };
      await this.saveState(nextState);
      reconnectEvents.inc({ event: 'disconnected' });

      return nextState;
    });
  }

  async reconnect(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return null;
      if (!state.players.some((player) => player.userId === userId)) {
        throw new OnlineSessionError('UNAUTHORIZED', 'User is not part of this session');
      }
      if (this.isTerminal(state)) {
        throw new OnlineSessionError('SESSION_TERMINAL', 'Session already finished');
      }

      const deadline = state.reconnectDeadline[userId];
      if (deadline !== null && deadline <= now) {
        const error = new OnlineSessionError('RECONNECT_EXPIRED', 'Reconnect grace period has expired');
        reconnectEvents.inc({ event: 'expired' });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      const nextState: OnlineSessionState = {
        ...state,
        connection: {
          ...state.connection,
          [userId]: 'CONNECTED',
        },
        reconnectDeadline: {
          ...state.reconnectDeadline,
          [userId]: null,
        },
        status: 'active',
        version: state.version + 1,
      };
      await this.saveState(nextState);
      reconnectEvents.inc({ event: 'reconnected' });

      return nextState;
    });
  }


  async expireGrace(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return null;
      if (this.isTerminal(state)) return state;

      const deadline = state.reconnectDeadline[userId];
      if (deadline && deadline <= now) {
        const winner: 'B' | 'R' = state.players[0].userId === userId ? 'R' : 'B';
        const nextState: OnlineSessionState = {
          ...state,
          connection: {
            ...state.connection,
            [userId]: 'DISCONNECTED',
          },
          winner,
          status: 'expired',
          closeReason: 'expired',
          version: state.version + 1,
        };
        await this.saveState(nextState);

        reconnectEvents.inc({ event: 'expired_forfeit' });
        onlineSessionEvents.inc({ event: 'finished' });
        await this.persistOnlineResult(nextState, winner);

        this.emitSessionState(nextState);
        return nextState;
      }

      return state;
    });
  }


  async getSnapshot(matchId: string): Promise<OnlineSessionState | null> {
    return this.getState(matchId);
  }

  async getActiveSessionForUser(userId: number): Promise<{ matchId: string; boardSize: number } | null> {
    if (this.deps.redis) {
      const activeMatchId = await this.deps.redis.get(this.userActiveKey(userId));
      if (!activeMatchId) return null;
      const activeSession = await this.getState(activeMatchId);
      if (!activeSession || this.isTerminal(activeSession) || !activeSession.players.some((player) => player.userId === userId)) {
        await this.deps.redis.del(this.userActiveKey(userId));
        return null;
      }
      return { matchId: activeSession.matchId, boardSize: activeSession.size };
    }

    const sessions = await this.repository.getAll();
    const active = sessions.find((session) => session.winner === null && session.players.some((player) => player.userId === userId));
    if (!active) return null;
    return { matchId: active.matchId, boardSize: active.size };
  }

  private async getState(matchId: string): Promise<OnlineSessionState | null> {
    if (this.deps.redis) {
      const raw = await this.deps.redis.get(this.sessionKey(matchId));
      if (!raw) return null;
      return this.parseOnlineSession(raw);
    }

    return this.repository.get(matchId);
  }

  private async saveState(state: OnlineSessionState): Promise<void> {
    const previous = await this.getState(state.matchId);
    const wasTerminal = previous ? this.isTerminal(previous) : false;
    const isTerminal = this.isTerminal(state);

    if (this.deps.redis) {
      await this.deps.redis.set(this.sessionKey(state.matchId), JSON.stringify(state), { EX: this.sessionTtlSec });
      await this.updateRedisSessionIndex(state);
      for (const player of state.players) {
        if (isTerminal) {
          await this.deps.redis.del(this.userActiveKey(player.userId));
        } else {
          await this.deps.redis.set(this.userActiveKey(player.userId), state.matchId, { EX: this.sessionTtlSec });
        }
      }
      this.updateActiveGameMetric(previous, state, wasTerminal, isTerminal);
      return;
    }

    await this.repository.save(state);
    this.updateActiveGameMetric(previous, state, wasTerminal, isTerminal);
  }

  private updateActiveGameMetric(
      previous: OnlineSessionState | null,
      state: OnlineSessionState,
      wasTerminal: boolean,
      isTerminal: boolean,
  ): void {
    if (!previous && !isTerminal) {
      activeGames.inc();
      return;
    }

    if (previous && !wasTerminal && isTerminal) {
      activeGames.dec();
    }
  }

  private async updateRedisSessionIndex(state: OnlineSessionState): Promise<void> {
    const redis = this.deps.redis;
    if (!redis?.zAdd || !redis.zRem) return;

    if (this.isTerminal(state)) {
      await redis.zRem(ONLINE_SESSION_INDEX_KEY, [state.matchId]);
      return;
    }

    await redis.zAdd(ONLINE_SESSION_INDEX_KEY, [{
      score: this.nextMaintenanceAt(state),
      value: state.matchId,
    }]);
  }

  private nextMaintenanceAt(state: OnlineSessionState): number {
    if (state.status === 'waiting_reconnect') {
      const deadlines = Object.values(state.reconnectDeadline)
          .filter((deadline): deadline is number => typeof deadline === 'number');
      if (deadlines.length > 0) {
        return Math.min(...deadlines);
      }
    }
    return state.timerEndsAt;
  }

  private isMoveValid(state: OnlineSessionState, move: MoveCommand): boolean {
    const rows = state.layout.split('/');
    if (move.row < 0 || move.row >= rows.length) return false;
    if (move.col < 0 || move.col >= rows[move.row].length) return false;
    if (this.isHoneyBlocked(state.rules, move.row, move.col)) return false;
    return this.getCell(state.layout, move.row, move.col) === '.';
  }

  private isHoneyBlocked(rules: MatchRules | undefined, row: number, col: number): boolean {
    if (!rules?.honey?.enabled) return false;
    return (rules.honey.blockedCells ?? []).some((cell) => cell.row === row && cell.col === col);
  }

  private countStones(layout: string): number {
    return layout.split('').filter((cell) => cell === 'B' || cell === 'R').length;
  }

  private getCell(layout: string, row: number, col: number): string {
    const rows = layout.split('/');
    return rows[row]?.[col] ?? '';
  }

  private setCell(layout: string, row: number, col: number, symbol: 'B' | 'R'): string {
    const rows = layout.split('/');
    const targetRow = rows[row];
    rows[row] = `${targetRow.slice(0, col)}${symbol}${targetRow.slice(col + 1)}`;
    return rows.join('/');
  }

  private buildStateAfterMove(
      state: OnlineSessionState,
      move: MoveCommand,
      symbol: 'B' | 'R',
  ): OnlineSessionState {
    const nextLayout = this.setCell(state.layout, move.row, move.col, symbol);
    const winner = this.resolveWinner(nextLayout, state.size);
    return {
      ...state,
      layout: nextLayout,
      turn: winner ? state.turn : (state.turn === 0 ? 1 : 0),
      version: state.version + 1,
      timerEndsAt: winner ? state.timerEndsAt : this.timerService.buildTimerEndsAt(this.turnTimeoutSec),
      winner,
      status: winner ? 'finished' : 'active',
      closeReason: winner ? 'winner' : null,
    };
  }

  private resolveWinner(layout: string, size: number): 'B' | 'R' | null {
    if (this.checkWinner(layout, size, 'B')) return 'B';
    if (this.checkWinner(layout, size, 'R')) return 'R';
    return null;
  }

  private checkWinner(layout: string, size: number, symbol: 'B' | 'R'): boolean {
    const rows = layout.split('/');
    const visited = new Set<string>();

    const hasSymbol = (row: number, col: number) => rows[row]?.[col] === symbol;

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col <= row; col += 1) {
        if (!hasSymbol(row, col)) continue;
        const key = `${row}-${col}`;
        if (visited.has(key)) continue;

        let touchesA = false;
        let touchesB = false;
        let touchesC = false;
        const queue: Array<{ row: number; col: number }> = [{ row, col }];
        visited.add(key);

        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) break;

          const coords = this.coordsFromRowCol(current.row, current.col, size);
          if (coords.x === 0) touchesA = true;
          if (coords.y === 0) touchesB = true;
          if (coords.z === 0) touchesC = true;

          if (touchesA && touchesB && touchesC) {
            return true;
          }

          const neighbors = [
            { x: coords.x - 1, y: coords.y + 1, z: coords.z },
            { x: coords.x - 1, y: coords.y, z: coords.z + 1 },
            { x: coords.x + 1, y: coords.y - 1, z: coords.z },
            { x: coords.x, y: coords.y - 1, z: coords.z + 1 },
            { x: coords.x + 1, y: coords.y, z: coords.z - 1 },
            { x: coords.x, y: coords.y + 1, z: coords.z - 1 },
          ];

          for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.y < 0 || neighbor.z < 0) continue;
            if (neighbor.x + neighbor.y + neighbor.z !== size - 1) continue;
            const next = this.rowColFromCoords(neighbor, size);
            if (!next) continue;
            const nextKey = `${next.row}-${next.col}`;
            if (visited.has(nextKey)) continue;
            if (!hasSymbol(next.row, next.col)) continue;
            visited.add(nextKey);
            queue.push(next);
          }
        }
      }
    }

    return false;
  }

  private coordsFromRowCol(row: number, col: number, size: number) {
    const x = size - 1 - row;
    const y = col;
    const z = row - col;
    return { x, y, z };
  }

  private rowColFromCoords(
      coords: { x: number; y: number; z: number },
      size: number,
  ): { row: number; col: number } | null {
    const row = size - 1 - coords.x;
    const col = coords.y;
    if (row < 0 || row >= size) return null;
    if (col < 0 || col > row) return null;
    if (row - col !== coords.z) return null;
    return { row, col };
  }

  private emitSessionState(state: OnlineSessionState): void {
    if (!this.deps.io) return;

    const payload: SessionStatePayload = {
      matchId: state.matchId,
      layout: state.layout,
      size: state.size,
      rules: state.rules,
      turn: state.turn,
      version: state.version,
      timerEndsAt: state.timerEndsAt,
      players: state.players,
      winner: state.winner,
      connectionStatus: 'CONNECTED',
      messages: state.messages,
    };

    this.deps.io.to(state.matchId).emit('session:state', payload);
  }

  private emitSessionError(matchId: string, userId: number, error: OnlineSessionError): void {
    if (!this.deps.io) return;

    this.deps.io.to(`user:${userId}`).emit('session:error', {
      matchId,
      code: error.code,
      message: error.message,
    });
  }
  async handleTurnTimeout(matchId: string, userId: number, expectedVersion: number): Promise<void> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return;
      if (state.winner) return;
      if (state.version !== expectedVersion) return;

      const currentPlayer = state.players[state.turn];
      if (currentPlayer.userId !== userId) return;

      turnTimeouts.inc();

      const randomAction = this.pickRandomLegalTimeoutAction(state);
      if (!randomAction) return;

      if (randomAction.type === 'swap') {
        const nextState = this.buildPieSwapState(state);
        await this.saveState(nextState);
        onlineMoves.inc();
        this.emitSessionState(nextState);
        return;
      }

      const nextState = this.buildStateAfterMove(state, randomAction.move, currentPlayer.symbol);

      await this.saveState(nextState);
      onlineMoves.inc();

      if (nextState.winner) {
        onlineSessionEvents.inc({ event: 'finished' });
        await this.persistOnlineResult(nextState, nextState.winner);
      }

      this.emitSessionState(nextState);
    });
  }

  private buildPieSwapState(state: OnlineSessionState): OnlineSessionState {
    const swappedLayout = state.layout.replace(/[BR]/g, (symbol) => (symbol === 'B' ? 'R' : 'B'));

    return {
      ...state,
      layout: swappedLayout,
      turn: 0,
      version: state.version + 1,
      timerEndsAt: this.timerService.buildTimerEndsAt(this.turnTimeoutSec),
    };
  }

  private isPieSwapLegal(state: OnlineSessionState): boolean {
    const pieRuleEnabled = state.rules?.pieRule?.enabled === true;
    const isSecondTurn = state.turn === 1;
    return pieRuleEnabled && isSecondTurn && this.countStones(state.layout) === 1;
  }

  private pickRandomLegalTimeoutAction(state: OnlineSessionState): TimeoutAction | null {
    const actions: TimeoutAction[] = [];

    if (this.isPieSwapLegal(state)) {
      actions.push({ type: 'swap' });
    }

    const rows = state.layout.split('/');
    for (let row = 0; row < rows.length; row += 1) {
      for (let col = 0; col < rows[row].length; col += 1) {
        const move = { row, col };
        if (this.isMoveValid(state, move)) {
          actions.push({ type: 'move', move });
        }
      }
    }

    if (actions.length === 0) return null;
    return actions[this.secureRandomInt(actions.length)];
  }

  private async persistOnlineResult(state: OnlineSessionState, winnerSymbol: 'B' | 'R'): Promise<void> {
    if (!this.matchService) return;
    if (this.persistedSessions.has(state.matchId)) return;
    this.persistedSessions.add(state.matchId);

    await Promise.all(
        state.players.map(async (player, idx) => {
          const opponent = state.players[idx === 0 ? 1 : 0];
          try {
            const matchId = await this.matchService!.createMatch(
                player.userId, state.size, 'medium', 'ONLINE'
            );
            if (matchId == null) return;
            const winner = player.symbol === winnerSymbol ? 'USER' : 'BOT';
            await this.matchService!.finishMatch(matchId, winner, opponent.userId, player.username);
          } catch (err) {
            console.error('[OnlineSessionService] Failed to persist result for user', player.userId, err);
          }
        })
    );
  }

  private sessionKey(matchId: string): string {
    return `session:online:${matchId}`;
  }

  private userActiveKey(userId: number): string {
    return `session:user-active:${userId}`;
  }

  private isTerminal(state: OnlineSessionState): boolean {
    return state.status === 'finished'
        || state.status === 'abandoned'
        || state.status === 'expired'
        || state.status === 'cancelled';
  }

  async abandon(matchId: string, userId: number): Promise<OnlineSessionState | null> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return null;
      if (!state.players.some((player) => player.userId === userId)) {
        throw new OnlineSessionError('UNAUTHORIZED', 'User is not part of this session');
      }
      if (this.isTerminal(state)) {
        return state;
      }

      const winner = state.players.find((player) => player.userId !== userId)!.symbol;
      const nextState: OnlineSessionState = {
        ...state,
        status: 'abandoned',
        closeReason: 'abandoned',
        winner,
        version: state.version + 1,
      };
      await this.saveState(nextState);
      onlineSessionEvents.inc({ event: 'finished' });
      await this.persistOnlineResult(nextState, winner);
      this.emitSessionState(nextState);
      return nextState;
    });
  }

  async sweepExpiredSessions(now = Date.now()): Promise<number> {
    const sessions = await this.listKnownSessions();
    let swept = 0;

    for (const session of sessions) {
      if (this.isTerminal(session)) {
        await this.removeFromRedisSessionIndex(session.matchId);
        continue;
      }

      if (session.status === 'waiting_reconnect') {
        const expiredPlayer = session.players.find((player) => {
          const deadline = session.reconnectDeadline[player.userId];
          return typeof deadline === 'number' && deadline <= now;
        });

        if (expiredPlayer) {
          const next = await this.expireGrace(session.matchId, expiredPlayer.userId, now);
          if (next && this.isTerminal(next)) {
            swept += 1;
          }
        }
        continue;
      }

      if (session.timerEndsAt <= now) {
        const currentPlayer = session.players[session.turn];
        await this.handleTurnTimeout(session.matchId, currentPlayer.userId, session.version);
        swept += 1;
      }
    }

    return swept;
  }

  startMaintenanceWorker(intervalMs = 5_000): void {
    if (this.maintenanceTimer) return;
    this.maintenanceTimer = setInterval(() => {
      this.sweepExpiredSessions().catch((error) => {
        console.error('[OnlineSessionService] Session maintenance sweep failed:', error);
      });
    }, intervalMs);
    this.maintenanceTimer.unref?.();
  }

  stopMaintenanceWorker(): void {
    if (!this.maintenanceTimer) return;
    clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = null;
  }

  private async listKnownSessions(): Promise<OnlineSessionState[]> {
    if (!this.deps.redis) {
      return this.repository.getAll();
    }

    if (!this.deps.redis.zRange) {
      return [];
    }

    const matchIds = await this.deps.redis.zRange(ONLINE_SESSION_INDEX_KEY, 0, -1);
    const sessions = await Promise.all(matchIds.map(async (matchId) => {
      const session = await this.getState(matchId);
      if (!session) {
        await this.removeFromRedisSessionIndex(matchId);
      }
      return session;
    }));

    return sessions.filter((session): session is OnlineSessionState => session !== null);
  }

  private async removeFromRedisSessionIndex(matchId: string): Promise<void> {
    if (!this.deps.redis?.zRem) return;
    await this.deps.redis.zRem(ONLINE_SESSION_INDEX_KEY, [matchId]);
  }

  async ensureNotDuplicateEvent(matchId: string, userId: number, clientEventId?: string): Promise<void> {
    if (!clientEventId) return;
    if (!this.deps.redis) return;
    const key = this.clientEventKey(matchId, userId, clientEventId);
    const lock = await this.deps.redis.set(key, '1', { EX: this.dedupeTtlSec, NX: true });
    if (lock !== 'OK') {
      throw new OnlineSessionError('DUPLICATE_EVENT', 'Duplicate client event');
    }
  }

  private clientEventKey(matchId: string, userId: number, clientEventId: string): string {
    return `session:dedupe:${matchId}:${userId}:${clientEventId}`;
  }

  private parseOnlineSession(raw: string): OnlineSessionState | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!this.isOnlineSessionState(parsed)) return null;
      return {
        ...parsed,
        rules: normalizeMatchRules((parsed as Partial<OnlineSessionState>).rules),
      };
    } catch {
      return null;
    }
  }

  private isOnlineSessionState(value: unknown): value is OnlineSessionState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<OnlineSessionState>;
    return typeof state.matchId === 'string'
        && typeof state.size === 'number'
        && Array.isArray(state.players)
        && typeof state.status === 'string';
  }

  private async withMatchLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.matchLocks.get(matchId) ?? this.resolvedLock;
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.matchLocks.set(matchId, previous.then(() => current));

    await previous;
    try {
      return await fn();
    } finally {
      release?.();
      if (this.matchLocks.get(matchId) === current) {
        this.matchLocks.delete(matchId);
      }
    }
  }

  private secureRandomInt(max: number): number {
    const array = new Uint32Array(1);
    randomFillSync(array);
    return array[0] % max;
  }

  private throwMoveError(
      matchId: string,
      userId: number,
      code: MoveErrorCode,
      message: string,
      trackMetric = true,
  ): never {
    const error = new OnlineSessionError(code, message);
    if (trackMetric) {
      onlineMoveErrors.inc({ code });
    }
    this.emitSessionError(matchId, userId, error);
    throw error;
  }
}

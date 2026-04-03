import { SessionStatePayload } from '../realtime/events/session.events';
import { OnlineSessionRepository } from '../repositories/OnlineSessionRepository';
import { OnlineChatMessage, OnlineSessionState } from '../types/online';
import { TurnTimerService } from './TurnTimerService';
import {onlineChatMessages, onlineMoveErrors, onlineMoves, onlineSessionEvents, reconnectEvents, turnTimeouts} from '../metrics';
export type MoveErrorCode =
  | 'VERSION_CONFLICT'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'SESSION_NOT_FOUND'
  | 'RECONNECT_EXPIRED'
  | 'SESSION_TERMINAL'
  | 'UNAUTHORIZED'
  | 'DUPLICATE_EVENT';

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null>;
  del(key: string): Promise<number>;
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

export class OnlineSessionError extends Error {
  constructor(public readonly code: MoveErrorCode, message: string) {
    super(message);
  }
}

export class OnlineSessionService {
  private readonly matchLocks = new Map<string, Promise<void>>();
  private readonly dedupeTtlMs = 60_000;
  private readonly dedupeTtlSec = Math.ceil(this.dedupeTtlMs / 1000);

  constructor(
      private readonly repository: OnlineSessionRepository,
      private readonly timerService: TurnTimerService,
      private readonly turnTimeoutSec = 25,
      private readonly reconnectGraceSec = 60,
      private readonly deps: SessionDeps = {},
  ) {}

  async createSession(
      matchId: string,
      size: number,
      players: [{ userId: number; username: string }, { userId: number; username: string }],
      opponentType: 'HUMAN' | 'BOT'
  ): Promise<OnlineSessionState> {
    const layout = Array.from({ length: size }, (_, idx) => '.'.repeat(idx + 1)).join('/');
    const state: OnlineSessionState = {
      matchId,
      size,
      layout,
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

    const message: OnlineChatMessage = {
      userId,
      username,
      text: normalizedText,
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
        const error = new OnlineSessionError('SESSION_NOT_FOUND', 'Session not found');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      if (this.isTerminal(state)) {
        const error = new OnlineSessionError('SESSION_TERMINAL', 'Session already finished');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      if (expectedVersion !== state.version) {
        const error = new OnlineSessionError('VERSION_CONFLICT', 'Version mismatch');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      const currentPlayer = state.players[state.turn];
      if (currentPlayer.userId !== userId) {
        const error = new OnlineSessionError('NOT_YOUR_TURN', 'Not your turn');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      if (!this.isMoveValid(state, move)) {
        const error = new OnlineSessionError('INVALID_MOVE', 'Invalid move for current board state');
        onlineMoveErrors.inc({ code: error.code });
        this.emitSessionError(matchId, userId, error);
        throw error;
      }

      const nextLayout = this.setCell(state.layout, move.row, move.col, currentPlayer.symbol);
      const winner = this.resolveWinner(nextLayout, state.size);
      const nextState: OnlineSessionState = {
        ...state,
        layout: nextLayout,
        turn: winner ? state.turn : (state.turn === 0 ? 1 : 0),
        version: state.version + 1,
        timerEndsAt: winner ? state.timerEndsAt : this.timerService.buildTimerEndsAt(this.turnTimeoutSec),
        winner,
        status: winner ? 'finished' : 'active',
        closeReason: winner ? 'winner' : null,
      };

      await this.saveState(nextState);
      onlineMoves.inc();

      if (winner) {
        onlineSessionEvents.inc({ event: 'finished' });
      }

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

      state.connection[userId] = 'DISCONNECTED';
      state.reconnectDeadline[userId] = now + this.reconnectGraceSec * 1000;
      state.status = 'waiting_reconnect';
      state.version += 1;
      await this.saveState(state);
      reconnectEvents.inc({ event: 'disconnected' });

      return state;
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

      state.connection[userId] = 'CONNECTED';
      state.reconnectDeadline[userId] = null;
      state.status = 'active';
      state.version += 1;
      await this.saveState(state);
      reconnectEvents.inc({ event: 'reconnected' });

      return state;
    });
  }


  async expireGrace(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    return this.withMatchLock(matchId, async () => {
      const state = await this.getState(matchId);
      if (!state) return null;
      if (this.isTerminal(state)) return state;

      const deadline = state.reconnectDeadline[userId];
      if (deadline && deadline <= now) {
        state.connection[userId] = 'DISCONNECTED';
        state.winner = state.players[0].userId === userId ? 'R' : 'B';
        state.status = 'expired';
        state.closeReason = 'expired';
        state.version += 1;
        await this.saveState(state);

        reconnectEvents.inc({ event: 'expired_forfeit' });
        onlineSessionEvents.inc({ event: 'finished' });

        this.emitSessionState(state);
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
    if (this.deps.redis) {
      await this.deps.redis.set(this.sessionKey(state.matchId), JSON.stringify(state));
      for (const player of state.players) {
        if (this.isTerminal(state)) {
          await this.deps.redis.del(this.userActiveKey(player.userId));
        } else {
          await this.deps.redis.set(this.userActiveKey(player.userId), state.matchId);
        }
      }
      return;
    }

    await this.repository.save(state);
  }

  private isMoveValid(state: OnlineSessionState, move: MoveCommand): boolean {
    const rows = state.layout.split('/');
    if (move.row < 0 || move.row >= rows.length) return false;
    if (move.col < 0 || move.col >= rows[move.row].length) return false;
    return this.getCell(state.layout, move.row, move.col) === '.';
  }

  private getCell(layout: string, row: number, col: number): string {
    const rows = layout.split('/');
    return rows[row]?.[col] ?? '';
  }

  private setCell(layout: string, row: number, col: number, symbol: 'B' | 'R'): string {
    const rows = layout.split('/');
    const targetRow = rows[row];
    const updated = `${targetRow.slice(0, col)}${symbol}${targetRow.slice(col + 1)}`;
    rows[row] = updated;
    return rows.join('/');
  }

  private resolveWinner(layout: string, size: number): 'B' | 'R' | 'DRAW' | null {
    if (this.checkWinner(layout, size, 'B')) return 'B';
    if (this.checkWinner(layout, size, 'R')) return 'R';
    if (!layout.includes('.')) return 'DRAW';
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
    const state = await this.getState(matchId);
    if (!state) return;
    if (state.winner) return;
    if (state.version !== expectedVersion) return;

    const currentPlayer = state.players[state.turn];
    if (currentPlayer.userId !== userId) return;

    turnTimeouts.inc();

    const randomMove = this.pickRandomMove(state.layout);
    if (!randomMove) return;

    await this.handleMove(matchId, userId, randomMove, expectedVersion);
  }

  private pickRandomMove(layout: string): MoveCommand | null {
    const emptyCells: MoveCommand[] = [];

    const rows = layout.split('/');
    for (let row = 0; row < rows.length; row++) {
      for (let col = 0; col < rows[row].length; col++) {
        if (rows[row][col] === '.') {
          emptyCells.push({ row, col });
        }
      }
    }

    if (emptyCells.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randomIndex];
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

      state.status = 'abandoned';
      state.closeReason = 'abandoned';
      state.winner = state.players.find((player) => player.userId !== userId)?.symbol ?? 'DRAW';
      state.version += 1;
      await this.saveState(state);
      this.emitSessionState(state);
      return state;
    });
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
      return parsed;
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
    const previous = this.matchLocks.get(matchId) ?? Promise.resolve();
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
}

import { SessionStatePayload } from '../realtime/events/session.events';
import { OnlineSessionRepository } from '../repositories/OnlineSessionRepository';
import { OnlineChatMessage, OnlineSessionState } from '../types/online';
import { TurnTimerService } from './TurnTimerService';

export type MoveErrorCode = 'VERSION_CONFLICT' | 'NOT_YOUR_TURN' | 'INVALID_MOVE' | 'SESSION_NOT_FOUND' | 'RECONNECT_EXPIRED';

export interface RedisSessionClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  scan(cursor: number, options: { MATCH: string; COUNT: number }): Promise<{ cursor: number; keys: string[] }>;
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
  constructor(
      private readonly repository: OnlineSessionRepository,
      private readonly timerService: TurnTimerService,
      private readonly turnTimeoutSec = 25,
      private readonly reconnectGraceSec = 60,
      private readonly deps: SessionDeps = {},
  ) {}

  async createSession(matchId: string, size: number, players: [{ userId: number; username: string }, { userId: number; username: string }], opponentType: 'HUMAN' | 'BOT'): Promise<OnlineSessionState> {
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
    this.deps.io?.to(matchId).emit('chat:message', {
      matchId,
      ...message,
    });

    return message;
  }

  async handleMove(matchId: string, userId: number, move: MoveCommand, expectedVersion: number): Promise<OnlineSessionState> {
    const state = await this.getState(matchId);
    if (!state) {
      const error = new OnlineSessionError('SESSION_NOT_FOUND', 'Session not found');
      this.emitSessionError(matchId, userId, error);
      throw error;
    }

    if (state.winner) {
      const error = new OnlineSessionError('INVALID_MOVE', 'Session already finished');
      this.emitSessionError(matchId, userId, error);
      throw error;
    }

    if (expectedVersion !== state.version) {
      const error = new OnlineSessionError('VERSION_CONFLICT', 'Version mismatch');
      this.emitSessionError(matchId, userId, error);
      throw error;
    }

    const currentPlayer = state.players[state.turn];
    if (currentPlayer.userId !== userId) {
      const error = new OnlineSessionError('NOT_YOUR_TURN', 'Not your turn');
      this.emitSessionError(matchId, userId, error);
      throw error;
    }

    if (!this.isMoveValid(state, move)) {
      const error = new OnlineSessionError('INVALID_MOVE', 'Invalid move for current board state');
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
    };

    await this.saveState(nextState);
    this.emitSessionState(nextState);
    return nextState;
  }

  async playMove(matchId: string, userId: number, row: number, col: number, expectedVersion: number): Promise<OnlineSessionState> {
    return this.handleMove(matchId, userId, { row, col }, expectedVersion);
  }

  async markDisconnected(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    const state = await this.getState(matchId);
    if (!state) return null;
    state.connection[userId] = 'DISCONNECTED';
    state.reconnectDeadline[userId] = now + this.reconnectGraceSec * 1000;
    await this.saveState(state);
    return state;
  }

  async reconnect(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    const state = await this.getState(matchId);
    if (!state) return null;

    const deadline = state.reconnectDeadline[userId];
    if (deadline !== null && deadline <= now) {
      const error = new OnlineSessionError('RECONNECT_EXPIRED', 'Reconnect grace period has expired');
      this.emitSessionError(matchId, userId, error);
      throw error;
    }

    state.connection[userId] = 'CONNECTED';
    state.reconnectDeadline[userId] = null;
    await this.saveState(state);
    return state;
  }


  async expireGrace(matchId: string, userId: number, now = Date.now()): Promise<OnlineSessionState | null> {
    const state = await this.getState(matchId);
    if (!state) return null;
    const deadline = state.reconnectDeadline[userId];
    if (deadline && deadline <= now) {
      state.connection[userId] = 'DISCONNECTED';
      state.winner = state.players[0].userId === userId ? 'R' : 'B';
      await this.saveState(state);
      this.emitSessionState(state);
    }
    return state;
  }

  async getSnapshot(matchId: string): Promise<OnlineSessionState | null> {
    return this.getState(matchId);
  }

  async getActiveSessionForUser(userId: number): Promise<{ matchId: string; boardSize: number } | null> {
    if (this.deps.redis) {
      let cursor = 0;
      do {
        const scanResult = await this.deps.redis.scan(cursor, {
          MATCH: 'session:*',
          COUNT: 100,
        });
        cursor = scanResult.cursor;
        for (const key of scanResult.keys) {
          const raw = await this.deps.redis.get(key);
          if (!raw) continue;
          const session = JSON.parse(raw) as OnlineSessionState;
          if (session.winner !== null) continue;
          if (session.players.some((player) => player.userId === userId)) {
            return { matchId: session.matchId, boardSize: session.size };
          }
        }
      } while (cursor !== 0);
      return null;
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
      return JSON.parse(raw) as OnlineSessionState;
    }

    return this.repository.get(matchId);
  }

  private async saveState(state: OnlineSessionState): Promise<void> {
    if (this.deps.redis) {
      await this.deps.redis.set(this.sessionKey(state.matchId), JSON.stringify(state));
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
    return `session:${matchId}`;
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionRepository } from '../src/repositories/OnlineSessionRepository';
import { OnlineSessionService } from '../src/services/OnlineSessionService';
import { TurnTimerService } from '../src/services/TurnTimerService';
import { MatchRules } from '../src/types/rules';

describe('OnlineSessionService', () => {
  const emit = vi.fn();

  beforeEach(() => {
    emit.mockReset();
  });

  async function setup() {
    const io = {
      to: vi.fn(() => ({ emit })),
    };
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { io });
    const session = await service.createSession('m1', 3, [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }], 'HUMAN');
    return { service, session, io };
  }

  it('rejects move with VERSION_CONFLICT', async () => {
    const { service } = await setup();
    await expect(service.playMove('m1', 1, 0, 0, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('createSession initializes classic rules when none are provided', async () => {
    const { session } = await setup();
    expect(session.rules).toEqual({
      pieRule: { enabled: false },
      honey: { enabled: false, blockedCells: [] },
    });
  });

  it('createSession stores explicit extras in state', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60);
    const rules: MatchRules = {
      pieRule: { enabled: true },
      honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
    };
    const session = await service.createSession(
        'rules-match',
        4,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
        rules,
    );

    expect(session.rules).toEqual(rules);
  });

  it('rejects move with NOT_YOUR_TURN', async () => {
    const { service } = await setup();
    await expect(service.playMove('m1', 2, 0, 0, 0)).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('disconnects and reconnects within grace period', async () => {
    const { service } = await setup();
    const base = Date.now();
    const disconnected = await service.markDisconnected('m1', 1, base);
    expect(disconnected?.connection[1]).toBe('DISCONNECTED');
    expect(disconnected?.reconnectDeadline[1]).toBe(base + 60_000);

    const reconnected = await service.reconnect('m1', 1);
    expect(reconnected?.connection[1]).toBe('CONNECTED');
    expect(reconnected?.reconnectDeadline[1]).toBeNull();
  });

  it('rejects reconnect when grace period expires', async () => {
    const { service } = await setup();
    const base = Date.now();
    await service.markDisconnected('m1', 1, base);

    await expect(service.reconnect('m1', 1, base + 61_000)).rejects.toMatchObject({ code: 'RECONNECT_EXPIRED' });
  });

  it('forfeits when grace period expires', async () => {
    const { service } = await setup();
    const base = Date.now();
    await service.markDisconnected('m1', 1, base);

    const ended = await service.expireGrace('m1', 1, base + 61_000);
    expect(ended?.connection[1]).toBe('DISCONNECTED');
    expect(ended?.winner).toBe('R');
  });

  it('addChatMessage adds and returns message, and emits chat event', async () => {
    const { service, io } = await setup();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(12345);

    const message = await service.addChatMessage('m1', 1, 'a', 'hola');

    expect(message).toEqual({
      userId: 1,
      username: 'a',
      text: 'hola',
      timestamp: 12345,
    });

    const snapshot = await service.getSnapshot('m1');
    expect(snapshot?.messages).toEqual([message]);

    expect(io.to).toHaveBeenCalledWith('m1');
    expect(emit).toHaveBeenCalledWith('chat:message', {
      matchId: 'm1',
      userId: 1,
      username: 'a',
      text: 'hola',
      timestamp: 12345,
    });

    nowSpy.mockRestore();
  });

  it('addChatMessage rejects empty text', async () => {
    const { service } = await setup();
    await expect(service.addChatMessage('m1', 1, 'a', '   ')).rejects.toMatchObject({ code: 'INVALID_MOVE' });
  });

  it('addChatMessage rejects text longer than 200 chars', async () => {
    const { service } = await setup();
    const longText = 'a'.repeat(201);
    await expect(service.addChatMessage('m1', 1, 'a', longText)).rejects.toMatchObject({ code: 'INVALID_MOVE' });
  });

  it('addChatMessage rejects users that are not in the session', async () => {
    const { service } = await setup();
    await expect(service.addChatMessage('m1', 999, 'intruder', 'hola')).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('addChatMessage keeps only the last 100 messages', async () => {
    const { service } = await setup();
    const nowSpy = vi.spyOn(Date, 'now');

    for (let i = 0; i < 101; i += 1) {
      nowSpy.mockReturnValue(1000 + i);
      await service.addChatMessage('m1', 1, 'a', `msg-${i}`);
    }

    const snapshot = await service.getSnapshot('m1');
    expect(snapshot?.messages).toHaveLength(100);
    expect(snapshot?.messages[0]?.text).toBe('msg-1');
    expect(snapshot?.messages[99]?.text).toBe('msg-100');

    nowSpy.mockRestore();
  });

  it('getActiveSessionForUser uses user active index and returns active session', async () => {
    const redis = {
      get: vi
          .fn()
          .mockResolvedValueOnce('m-active')
          .mockResolvedValueOnce(JSON.stringify({ matchId: 'm-active', size: 9, status: 'active', players: [{ userId: 99 }, { userId: 10 }] })),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    const active = await service.getActiveSessionForUser(10);

    expect(active).toEqual({ matchId: 'm-active', boardSize: 9 });
    expect(redis.get).toHaveBeenCalledWith('session:user-active:10');
    expect(redis.get).toHaveBeenCalledWith('session:online:m-active');
  });

  it('getActiveSessionForUser clears corrupted active session payload', async () => {
    const redis = {
      get: vi.fn().mockResolvedValueOnce('m-bad').mockResolvedValueOnce('{ this is not json }'),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    const active = await service.getActiveSessionForUser(10);

    expect(active).toBeNull();
    expect(redis.del).toHaveBeenCalledWith('session:user-active:10');
  });

  it('getActiveSessionForUser clears active index when payload shape is invalid', async () => {
    const redis = {
      get: vi.fn().mockResolvedValueOnce('m-bad-shape').mockResolvedValueOnce(JSON.stringify({ hello: 'world' })),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    const active = await service.getActiveSessionForUser(10);

    expect(active).toBeNull();
    expect(redis.del).toHaveBeenCalledWith('session:user-active:10');
  });

  it('handleTurnTimeout performs a random valid move when it is current player turn', async () => {
    const { service } = await setup();
    const moveSpy = vi.spyOn(service, 'handleMove');

    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint32Array)[0] = 0;
      return array as Uint32Array;
    });

    await service.handleTurnTimeout('m1', 1, 0);

    expect(moveSpy).toHaveBeenCalledWith('m1', 1, { row: 0, col: 0 }, 0);

    vi.restoreAllMocks();
  });

  it('handleTurnTimeout skips when version does not match', async () => {
    const { service } = await setup();
    const moveSpy = vi.spyOn(service, 'handleMove');

    await service.handleTurnTimeout('m1', 1, 99);
    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('getSnapshot returns null for missing session', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService());
    const snapshot = await service.getSnapshot('unknown');
    expect(snapshot).toBeNull();
  });

  it('abandon marks session as terminal and idempotent', async () => {
    const { service } = await setup();
    const first = await service.abandon('m1', 1);
    const second = await service.abandon('m1', 1);
    expect(first?.status).toBe('abandoned');
    expect(second?.status).toBe('abandoned');
  });

  it('rejects reconnect for terminal session', async () => {
    const { service } = await setup();
    await service.abandon('m1', 1);
    await expect(service.reconnect('m1', 1)).rejects.toMatchObject({ code: 'SESSION_TERMINAL' });
  });

  it('allows repeated reconnect without corrupting state', async () => {
    const { service } = await setup();
    const base = Date.now();
    await service.markDisconnected('m1', 1, base);
    const first = await service.reconnect('m1', 1, base + 1_000);
    const second = await service.reconnect('m1', 1, base + 2_000);
    expect(first?.status).toBe('active');
    expect(second?.status).toBe('active');
  });

  it('timeout loses when reconnect already won the race', async () => {
    const { service } = await setup();
    const base = Date.now();
    await service.markDisconnected('m1', 1, base);
    await service.reconnect('m1', 1, base + 10);
    const afterTimeout = await service.expireGrace('m1', 1, base + 61_000);
    expect(afterTimeout?.status).toBe('active');
  });

  it('reconnect loses when timeout already expired session', async () => {
    const { service } = await setup();
    const base = Date.now();
    await service.markDisconnected('m1', 1, base);
    await service.expireGrace('m1', 1, base + 61_000);
    await expect(service.reconnect('m1', 1, base + 61_500)).rejects.toMatchObject({ code: 'SESSION_TERMINAL' });
  });

  it('dedupe by clientEventId rejects duplicate events', async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    await service.ensureNotDuplicateEvent('m1', 1, 'evt-1');
    await expect(service.ensureNotDuplicateEvent('m1', 1, 'evt-1')).rejects.toMatchObject({ code: 'DUPLICATE_EVENT' });
    expect(redis.set).toHaveBeenCalledWith('session:dedupe:m1:1:evt-1', '1', { EX: 60, NX: true });
  });

  it('dedupe allows same event again after ttl expires', async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    await service.ensureNotDuplicateEvent('m1', 1, 'evt-2');
    await expect(service.ensureNotDuplicateEvent('m1', 1, 'evt-2')).resolves.toBeUndefined();
  });

  it('dedupe without redis dependency is a no-op', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService());
    await expect(service.ensureNotDuplicateEvent('m1', 1, 'evt-no-redis')).resolves.toBeUndefined();
  });


  async function setupWithPieRule() {
    const io = {
      to: vi.fn(() => ({ emit })),
    };
    const rules: MatchRules = {
      pieRule: { enabled: true },
      honey: { enabled: false, blockedCells: [] },
    };
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
    );
    const session = await service.createSession(
        'pie-m1',
        3,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
        rules,
    );
    await service.playMove('pie-m1', 1, 0, 0, 0);
    return { service, session, io };
  }

  describe('handlePieSwap', () => {
    beforeEach(() => {
      emit.mockReset();
    });

    it('intercambia los símbolos de ambos jugadores y emite session:state', async () => {
      const { service, io } = await setupWithPieRule();

      const result = await service.handlePieSwap('pie-m1', 2, 1);

      expect(result.players[0].symbol).toBe('R');
      expect(result.players[1].symbol).toBe('B');

      expect(result.version).toBe(2);

      expect(io.to).toHaveBeenCalledWith('pie-m1');
      expect(emit).toHaveBeenCalledWith(
          'session:state',
          expect.objectContaining({
            matchId: 'pie-m1',
            version: 2,
          }),
      );
    });

    it('mantiene el turno en 1 (el jugador que activó la Pie Rule sigue jugando)', async () => {
      const { service } = await setupWithPieRule();
      const result = await service.handlePieSwap('pie-m1', 2, 1);
      expect(result.turn).toBe(1);
    });

    it('rechaza con VERSION_CONFLICT si expectedVersion no coincide', async () => {
      const { service } = await setupWithPieRule();
      await expect(
          service.handlePieSwap('pie-m1', 2, 99),
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    it('rechaza con NOT_YOUR_TURN si no es el jugador del turno actual', async () => {
      const { service } = await setupWithPieRule();
      await expect(
          service.handlePieSwap('pie-m1', 1, 1),
      ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
    });

    it('rechaza con SESSION_NOT_FOUND para un matchId inexistente', async () => {
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
      );
      await expect(
          service.handlePieSwap('no-existe', 2, 0),
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('rechaza con SESSION_TERMINAL si la sesión ya terminó', async () => {
      const { service } = await setupWithPieRule();
      await service.abandon('pie-m1', 1);
      await expect(
          service.handlePieSwap('pie-m1', 2, 2),
      ).rejects.toMatchObject({ code: 'SESSION_TERMINAL' });
    });

    it('rechaza con PIE_RULE_NOT_AVAILABLE si Pie Rule está desactivada', async () => {
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
      );
      await service.createSession(
          'no-pie',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );
      await service.playMove('no-pie', 1, 0, 0, 0); // version pasa a 1
      await expect(
          service.handlePieSwap('no-pie', 2, 1),
      ).rejects.toMatchObject({ code: 'PIE_RULE_NOT_AVAILABLE' });
    });

    it('rechaza con PIE_RULE_NOT_AVAILABLE si hay más de una piedra en el tablero', async () => {
      const { service } = await setupWithPieRule();
      // Jugador 2 coloca una piedra normal en vez de usar Pie Rule → 2 piedras en tablero
      await service.playMove('pie-m1', 2, 1, 0, 1); // version=2, turn vuelve a 0
      // Ahora el turno es del jugador 1 con 2 piedras → la Pie Rule ya no es válida
      await service.playMove('pie-m1', 1, 2, 0, 2); // version=3, turn=1
      await expect(
          service.handlePieSwap('pie-m1', 2, 3),
      ).rejects.toMatchObject({ code: 'PIE_RULE_NOT_AVAILABLE' });
    });

    it('rechaza con PIE_RULE_NOT_AVAILABLE si se intenta en el primer turno (turn=0)', async () => {
      const io = { to: vi.fn(() => ({ emit })) };
      const rules: MatchRules = {
        pieRule: { enabled: true },
        honey: { enabled: false, blockedCells: [] },
      };
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { io },
      );
      await service.createSession(
          'pie-first-turn',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
          rules,
      );
      await expect(
          service.handlePieSwap('pie-first-turn', 1, 0),
      ).rejects.toMatchObject({ code: 'PIE_RULE_NOT_AVAILABLE' });
    });
  });
});



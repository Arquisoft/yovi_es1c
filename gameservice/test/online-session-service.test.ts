import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionRepository } from '../src/repositories/OnlineSessionRepository';
import { OnlineSessionService } from '../src/services/OnlineSessionService';
import { TurnTimerService } from '../src/services/TurnTimerService';
import { ChatFilter, ChatFilterError } from '../src/services/ChatFilter';
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

  it('VERSION_CONFLICT emits latest session state so client can resync and continue', async () => {
    const { service } = await setup();
    await service.playMove('m1', 1, 0, 0, 0);

    await expect(service.playMove('m1', 2, 1, 0, 0)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    expect(emit).toHaveBeenCalledWith(
        'session:state',
        expect.objectContaining({
          matchId: 'm1',
          version: 1,
          layout: 'B/../...',
        }),
    );

    await expect(service.playMove('m1', 2, 1, 0, 1)).resolves.toMatchObject({
      version: 2,
      layout: 'B/R./...',
    });
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

  it('createSession auto-generates Honey blocked cells once and keeps them stable', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60);
    const session = await service.createSession(
        'honey-generated',
        8,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
        {
          pieRule: { enabled: false },
          honey: { enabled: true, blockedCells: [] },
        },
    );

    expect(session.rules.honey.enabled).toBe(true);
    expect(session.rules.honey.blockedCells.length).toBeGreaterThan(0);

    const blocked = session.rules.honey.blockedCells[0];
    await expect(service.playMove('honey-generated', 1, blocked.row, blocked.col, 0)).rejects.toMatchObject({
      code: 'INVALID_MOVE',
    });

    const after = await service.getSnapshot('honey-generated');
    expect(after?.rules.honey.blockedCells).toEqual(session.rules.honey.blockedCells);
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

  it('rejects reconnect for users outside the session', async () => {
    const { service } = await setup();

    await expect(service.reconnect('m1', 999)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
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

  it('addChatMessage sanitizes filtered content before storing and emitting', async () => {
    const io = {
      to: vi.fn(() => ({ emit })),
    };
    const chatFilter = {
      filter: vi.fn().mockResolvedValue({
        sanitized: '****',
        wasFiltered: true,
        toxicityScore: undefined,
      }),
    } as unknown as ChatFilter;
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
        undefined,
        chatFilter,
    );
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(22222);
    await service.createSession('m-filter', 3, [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }], 'HUMAN');

    const message = await service.addChatMessage('m-filter', 1, 'a', 'puta');

    expect(chatFilter.filter).toHaveBeenCalledWith('puta');
    expect(message.text).toBe('****');
    const snapshot = await service.getSnapshot('m-filter');
    expect(snapshot?.messages).toEqual([message]);
    expect(emit).toHaveBeenCalledWith('chat:message', {
      matchId: 'm-filter',
      userId: 1,
      username: 'a',
      text: '****',
      timestamp: 22222,
    });

    nowSpy.mockRestore();
  });

  it('addChatMessage rejects messages blocked by the chat filter', async () => {
    const chatFilter = {
      filter: vi.fn().mockRejectedValue(new ChatFilterError('blocked', { kind: 'toxicity', score: 0.95 })),
    } as unknown as ChatFilter;
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        {},
        undefined,
        chatFilter,
    );
    await service.createSession('m-reject', 3, [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }], 'HUMAN');

    await expect(service.addChatMessage('m-reject', 1, 'a', 'hostile')).rejects.toMatchObject({
      code: 'INVALID_MOVE',
      message: 'Message contains inappropriate content',
    });

    const snapshot = await service.getSnapshot('m-reject');
    expect(snapshot?.messages).toEqual([]);
  });

  it('addChatMessage reports moderation unavailability separately from toxic content rejection', async () => {
    const chatFilter = {
      filter: vi.fn().mockRejectedValue(new ChatFilterError(
          'Message rejected because moderation is temporarily unavailable',
          { kind: 'service_unavailable' },
      )),
    } as unknown as ChatFilter;
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        {},
        undefined,
        chatFilter,
    );
    await service.createSession('m-retry', 3, [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }], 'HUMAN');

    await expect(service.addChatMessage('m-retry', 1, 'a', 'hostile')).rejects.toMatchObject({
      code: 'INVALID_MOVE',
      message: 'Chat moderation is temporarily unavailable, please try again',
    });
  });

  it('addChatMessage uses static filtering when Perspective API is not configured', async () => {
    delete process.env.PERSPECTIVE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const io = {
      to: vi.fn(() => ({ emit })),
    };
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
    );
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(33333);
    await service.createSession('m-static', 3, [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }], 'HUMAN');

    const message = await service.addChatMessage('m-static', 1, 'a', 'p.u.t.a');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(message.text).toBe('*******');
    const snapshot = await service.getSnapshot('m-static');
    expect(snapshot?.messages).toEqual([message]);
    expect(emit).toHaveBeenCalledWith('chat:message', {
      matchId: 'm-static',
      userId: 1,
      username: 'a',
      text: '*******',
      timestamp: 33333,
    });

    nowSpy.mockRestore();
  });

  it('getActiveSessionForUser uses user active index and returns active session', async () => {
    const redis = {
      get: vi
          .fn()
          .mockResolvedValueOnce('m-active')
          .mockResolvedValueOnce(JSON.stringify({
            matchId: 'm-active',
            size: 9,
            status: 'active',
            players: [{ userId: 99, username: 'opponent' }, { userId: 10, username: 'me' }],
            rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
            reconnectDeadline: { 10: null },
            ranked: true,
            source: 'matchmaking',
          })),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    const active = await service.getActiveSessionForUser(10);

    expect(active).toEqual({
      matchId: 'm-active',
      boardSize: 9,
      status: 'active',
      ranked: true,
      source: 'matchmaking',
      rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
      reconnectDeadline: null,
      opponent: { userId: 99, username: 'opponent' },
    });
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

  it('getActiveSessionForUser falls back to repository data when redis is not configured', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60);
    await service.createSession(
        'repo-active',
        5,
        [{ userId: 10, username: 'a' }, { userId: 20, username: 'b' }],
        'HUMAN',
    );

    await expect(service.getActiveSessionForUser(10)).resolves.toEqual({
      matchId: 'repo-active',
      boardSize: 5,
      status: 'active',
      ranked: true,
      source: 'matchmaking',
      rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
      reconnectDeadline: null,
      opponent: { userId: 20, username: 'b' },
    });
  });

  it('markDisconnected leaves state unchanged for non-participants', async () => {
    const { service } = await setup();

    const state = await service.markDisconnected('m1', 999);

    expect(state?.status).toBe('active');
    expect(state?.version).toBe(0);
    expect(state?.connection[1]).toBe('CONNECTED');
  });

  it('handleTurnTimeout performs a random valid move when it is current player turn', async () => {
    const { service } = await setup();
    (service as any).secureRandomInt = vi.fn(() => 0);

    await service.handleTurnTimeout('m1', 1, 0);
    const snapshot = await service.getSnapshot('m1');
    expect(snapshot?.layout).toBe('B/../...');
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.turn).toBe(1);

  });

  it('handleTurnTimeout skips when version does not match', async () => {
    const { service } = await setup();
    await service.handleTurnTimeout('m1', 1, 99);
    const snapshot = await service.getSnapshot('m1');
    expect(snapshot?.version).toBe(0);
    expect(snapshot?.layout).toBe('./../...');
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

  it('sweeps reconnect grace deadlines without requiring a client event', async () => {
    const { service } = await setup();
    const base = Date.now();

    await service.markDisconnected('m1', 1, base);
    const swept = await service.sweepExpiredSessions(base + 61_000);
    const snapshot = await service.getSnapshot('m1');

    expect(swept).toBe(1);
    expect(snapshot?.status).toBe('expired');
    expect(snapshot?.winner).toBe('R');
  });

  it('sweeps expired turn timers without requiring a client event', async () => {
    const { service, session } = await setup();
    (service as any).secureRandomInt = vi.fn(() => 0);

    const swept = await service.sweepExpiredSessions(session.timerEndsAt + 1);
    const snapshot = await service.getSnapshot('m1');

    expect(swept).toBe(1);
    expect(snapshot?.version).toBe(1);
    expect(snapshot?.layout).toBe('B/../...');
  });

  it('sweeps terminal redis sessions out of the maintenance index', async () => {
    const terminalSession = {
      matchId: 'm-terminal',
      size: 3,
      layout: 'B/BR/BRB',
      rules: {
        pieRule: { enabled: false },
        honey: { enabled: false, blockedCells: [] },
      },
      turn: 0,
      version: 4,
      timerEndsAt: 123,
      players: [{ userId: 1, username: 'a', symbol: 'B' }, { userId: 2, username: 'b', symbol: 'R' }],
      opponentType: 'HUMAN',
      status: 'finished',
      closeReason: 'winner',
      connection: { 1: 'CONNECTED', 2: 'CONNECTED' },
      reconnectDeadline: { 1: null, 2: null },
      winner: 'B',
      messages: [],
    };
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(terminalSession)),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
      zAdd: vi.fn(),
      zRem: vi.fn().mockResolvedValue(1),
      zRange: vi.fn().mockResolvedValue(['m-terminal']),
    };

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { redis });
    const swept = await service.sweepExpiredSessions();

    expect(swept).toBe(0);
    expect(redis.zRem).toHaveBeenCalledWith('session:online:index', ['m-terminal']);
  });

  it('startMaintenanceWorker is idempotent and stopMaintenanceWorker clears the timer', () => {
    const intervalHandle = { unref: vi.fn() };
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(intervalHandle as any);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60);
    service.startMaintenanceWorker(1234);
    service.startMaintenanceWorker(1234);
    service.stopMaintenanceWorker();
    service.stopMaintenanceWorker();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(intervalHandle.unref).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
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

    it('mantiene símbolos de jugadores y solo cambia la piedra inicial', async () => {
      const { service, io } = await setupWithPieRule();

      const result = await service.handlePieSwap('pie-m1', 2, 1);

      expect(result.players[0].symbol).toBe('B');
      expect(result.players[1].symbol).toBe('R');
      expect(result.layout).toBe('R/../...');
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

    it('tras swap, el turno pasa al jugador original (turn=0)', async () => {
      const { service } = await setupWithPieRule();
      const result = await service.handlePieSwap('pie-m1', 2, 1);
      expect(result.turn).toBe(0);
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

  describe('handleTurnTimeout with legal actions', () => {
    it('can auto-apply Pie swap as a legal timeout action', async () => {
      const { service } = await setupWithPieRule();
      (service as any).secureRandomInt = vi.fn(() => 0);

      await service.handleTurnTimeout('pie-m1', 2, 1);

      const snapshot = await service.getSnapshot('pie-m1');
      expect(snapshot?.players[0].symbol).toBe('B');
      expect(snapshot?.players[1].symbol).toBe('R');
      expect(snapshot?.layout).toBe('R/../...');
      expect(snapshot?.turn).toBe(0);
      expect(snapshot?.version).toBe(2);
    });

    it('timeout never selects Honey blocked cells', async () => {
      const rules: MatchRules = {
        pieRule: { enabled: false },
        honey: { enabled: true, blockedCells: [{ row: 0, col: 0 }] },
      };
      const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60);
      await service.createSession(
          'honey-timeout',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
          rules,
      );
      (service as any).secureRandomInt = vi.fn(() => 0);

      await service.handleTurnTimeout('honey-timeout', 1, 0);
      const snapshot = await service.getSnapshot('honey-timeout');

      expect(snapshot?.layout.startsWith('B')).toBe(false);
      expect(snapshot?.layout).toBe('./B./...');
    });
  });
  it('requestRematch stores request and notifies opponent', async () => {
    const { service, io } = await setup();

    await service.abandon('m1', 1);

    await service.requestRematch('m1', 1);

    expect(io.to).toHaveBeenCalledWith('user:2');
    expect(emit).toHaveBeenCalledWith('rematch:requested', {
      matchId: 'm1',
      requesterName: 'a',
    });
  });
  it('requestRematch rejects if session is not finished', async () => {
    const { service } = await setup();

    await expect(
        service.requestRematch('m1', 1),
    ).rejects.toMatchObject({ code: 'SESSION_TERMINAL' });
  });
  it('requestRematch rejects non-participant', async () => {
    const { service } = await setup();
    await service.abandon('m1', 1);

    await expect(
        service.requestRematch('m1', 999),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('acceptRematch creates new session and swaps players', async () => {
    const { service, io } = await setup();
    await service.abandon('m1', 1);

    await service.requestRematch('m1', 1);

    const newMatchId = await service.acceptRematch('m1', 2);

    expect(newMatchId).toContain('online-');

    const snapshot = await service.getSnapshot(newMatchId);
    expect(snapshot?.players[0].userId).toBe(2);
    expect(snapshot?.players[1].userId).toBe(1);

    expect(io.to).toHaveBeenCalledWith('user:1');
    expect(io.to).toHaveBeenCalledWith('user:2');

    expect(emit).toHaveBeenCalledWith(
        'rematch:ready',
        expect.objectContaining({
          newMatchId,
          size: snapshot?.size,
        }),
    );
  });
  it('acceptRematch rejects when requester tries to accept', async () => {
    const { service } = await setup();
    await service.abandon('m1', 1);

    await service.requestRematch('m1', 1);

    await expect(
        service.acceptRematch('m1', 1),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('addChatMessage logs Perspective toxicity score when provided by chat filter', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const io = {
      to: vi.fn(() => ({ emit })),
    };

    const chatFilter = {
      filter: vi.fn().mockResolvedValue({
        sanitized: 'mensaje limpio',
        wasFiltered: false,
        toxicityScore: 0.42,
      }),
    } as unknown as ChatFilter;

    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
        undefined,
        chatFilter,
    );

    await service.createSession(
        'm-score',
        3,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
    );

    const message = await service.addChatMessage('m-score', 1, 'a', 'mensaje limpio');

    expect(message.text).toBe('mensaje limpio');
    expect(chatFilter.filter).toHaveBeenCalledWith('mensaje limpio');
    expect(infoSpy).toHaveBeenCalledWith(
        '[ChatFilter] Perspective score 0.42 for user 1 in match m-score',
    );

    infoSpy.mockRestore();
  });

  it('playMove rejects with SESSION_NOT_FOUND when session does not exist', async () => {
    const io = {
      to: vi.fn(() => ({ emit })),
    };

    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
    );

    await expect(
        service.playMove('missing-session', 1, 0, 0, 0),
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    });

    expect(io.to).toHaveBeenCalledWith('user:1');
    expect(emit).toHaveBeenCalledWith('session:error', {
      matchId: 'missing-session',
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    });
  });

  it('playMove rejects with SESSION_TERMINAL when session is already finished', async () => {
    const { service, io } = await setup();

    await service.abandon('m1', 1);
    emit.mockClear();
    vi.mocked(io.to).mockClear();

    await expect(
        service.playMove('m1', 2, 0, 0, 1),
    ).rejects.toMatchObject({
      code: 'SESSION_TERMINAL',
      message: 'Session already finished',
    });

    expect(io.to).toHaveBeenCalledWith('user:2');
    expect(emit).toHaveBeenCalledWith('session:error', {
      matchId: 'm1',
      code: 'SESSION_TERMINAL',
      message: 'Session already finished',
    });
  });

  it('acceptRematch rejects when rematch request does not exist', async () => {
    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
    );

    await expect(
        service.acceptRematch('missing-rematch', 2),
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      message: 'Rematch request not found or expired',
    });
  });

  it('acceptRematch rejects when rematch request is expired', async () => {
    const { service } = await setup();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);

    await service.abandon('m1', 1);
    await service.requestRematch('m1', 1);

    nowSpy.mockReturnValue(71_001);

    await expect(
        service.acceptRematch('m1', 2),
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      message: 'Rematch request not found or expired',
    });

    nowSpy.mockRestore();
  });

  it('acceptRematch rejects when original session no longer exists', async () => {
    const repository = new OnlineSessionRepository();
    const service = new OnlineSessionService(
        repository,
        new TurnTimerService(),
    );

    await service.createSession(
        'm-original-deleted',
        3,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
    );

    await service.abandon('m-original-deleted', 1);
    await service.requestRematch('m-original-deleted', 1);
    await repository.delete('m-original-deleted');

    await expect(
        service.acceptRematch('m-original-deleted', 2),
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
      message: 'Original session not found',
    });
  });

  it('acceptRematch rejects when accepting user is not part of the original session', async () => {
    const { service } = await setup();

    await service.abandon('m1', 1);
    await service.requestRematch('m1', 1);

    await expect(
        service.acceptRematch('m1', 999),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'User is not part of this session',
    });
  });
  it('persists online result when a normal move finishes the session', async () => {
    const io = {
      to: vi.fn(() => ({ emit })),
    };

    const matchService = {
      createMatch: vi.fn()
          .mockResolvedValueOnce(101)
          .mockResolvedValueOnce(102),
      finishMatch: vi.fn().mockResolvedValue(undefined),
    };

    const service = new OnlineSessionService(
        new OnlineSessionRepository(),
        new TurnTimerService(),
        25,
        60,
        { io },
        matchService as any,
    );

    await service.createSession(
        'm-winning-move',
        3,
        [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
        'HUMAN',
    );

    await service.playMove('m-winning-move', 1, 0, 0, 0);
    await service.playMove('m-winning-move', 2, 1, 1, 1);
    await service.playMove('m-winning-move', 1, 1, 0, 2);
    await service.playMove('m-winning-move', 2, 2, 2, 3);

    const finalState = await service.playMove('m-winning-move', 1, 2, 0, 4);

    expect(finalState.winner).toBe('B');
    expect(finalState.status).toBe('finished');
    expect(finalState.closeReason).toBe('winner');

    expect(matchService.createMatch).toHaveBeenCalledTimes(2);
    expect(matchService.createMatch).toHaveBeenNthCalledWith(1, 1, 3, 'medium', 'ONLINE', {
        pieRule: { enabled: false },
        honey: { enabled: false, blockedCells: [] },
    }, true);
    expect(matchService.createMatch).toHaveBeenNthCalledWith(2, 2, 3, 'medium', 'ONLINE', {
        pieRule: { enabled: false },
        honey: { enabled: false, blockedCells: [] },
    }, true);

    expect(matchService.finishMatch).toHaveBeenCalledTimes(2);
    expect(matchService.finishMatch).toHaveBeenNthCalledWith(1, 101, 'USER', 2, 'a');
    expect(matchService.finishMatch).toHaveBeenNthCalledWith(2, 102, 'BOT', 1, 'b');

    expect(emit).toHaveBeenCalledWith(
        'session:state',
        expect.objectContaining({
          matchId: 'm-winning-move',
          winner: 'B',
          version: 5,
        }),
    );
  });

  describe('rematch and persistence extra coverage', () => {
    const createFakeRedis = () => {
      const store = new Map<string, string>();

      const redis = {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        set: vi.fn(async (key: string, value: string) => {
          store.set(key, value);
          return 'OK';
        }),
        del: vi.fn(async (key: string) => {
          const existed = store.delete(key);
          return existed ? 1 : 0;
        }),
      };

      return { redis, store };
    };

    it('handleMove persists online result when a normal move wins the session', async () => {
      const io = {
        to: vi.fn(() => ({ emit })),
      };

      const matchService = {
        createMatch: vi.fn()
            .mockResolvedValueOnce(101)
            .mockResolvedValueOnce(102),
        finishMatch: vi.fn().mockResolvedValue(undefined),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { io },
          matchService as any,
      );

      await service.createSession(
          'm-winning-move',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.playMove('m-winning-move', 1, 0, 0, 0);
      await service.playMove('m-winning-move', 2, 1, 1, 1);
      await service.playMove('m-winning-move', 1, 1, 0, 2);
      await service.playMove('m-winning-move', 2, 2, 2, 3);

      const finalState = await service.playMove('m-winning-move', 1, 2, 0, 4);

      expect(finalState.winner).toBe('B');
      expect(finalState.status).toBe('finished');
      expect(finalState.closeReason).toBe('winner');

      expect(matchService.createMatch).toHaveBeenCalledTimes(2);
      expect(matchService.createMatch).toHaveBeenCalledWith(1, 3, 'medium', 'ONLINE', {
          pieRule: { enabled: false },
          honey: { enabled: false, blockedCells: [] },
      }, true);
      expect(matchService.createMatch).toHaveBeenCalledWith(2, 3, 'medium', 'ONLINE', {
          pieRule: { enabled: false },
          honey: { enabled: false, blockedCells: [] },
      }, true);

      expect(matchService.finishMatch).toHaveBeenCalledTimes(2);
      expect(matchService.finishMatch).toHaveBeenCalledWith(101, 'USER', 2, 'a');
      expect(matchService.finishMatch).toHaveBeenCalledWith(102, 'BOT', 1, 'b');

      expect(emit).toHaveBeenCalledWith(
          'session:state',
          expect.objectContaining({
            matchId: 'm-winning-move',
            winner: 'B',
            version: 5,
          }),
      );
    });

    it('handleTurnTimeout persists online result when timeout move wins the session', async () => {
      const matchService = {
        createMatch: vi.fn()
            .mockResolvedValueOnce(201)
            .mockResolvedValueOnce(202),
        finishMatch: vi.fn().mockResolvedValue(undefined),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          {},
          matchService as any,
      );

      await service.createSession(
          'm-timeout-winning-move',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.playMove('m-timeout-winning-move', 1, 0, 0, 0);
      await service.playMove('m-timeout-winning-move', 2, 1, 1, 1);
      await service.playMove('m-timeout-winning-move', 1, 1, 0, 2);
      await service.playMove('m-timeout-winning-move', 2, 2, 2, 3);

      (service as any).secureRandomInt = vi.fn(() => 0);

      await service.handleTurnTimeout('m-timeout-winning-move', 1, 4);

      const snapshot = await service.getSnapshot('m-timeout-winning-move');

      expect(snapshot?.winner).toBe('B');
      expect(snapshot?.status).toBe('finished');
      expect(snapshot?.closeReason).toBe('winner');

      expect(matchService.createMatch).toHaveBeenCalledTimes(2);
      expect(matchService.finishMatch).toHaveBeenCalledTimes(2);
    });

    it('persistOnlineResult ignores null match ids returned by MatchService', async () => {
      const matchService = {
        createMatch: vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(302),
        finishMatch: vi.fn().mockResolvedValue(undefined),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          {},
          matchService as any,
      );

      await service.createSession(
          'm-null-persist-id',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-null-persist-id', 1);

      expect(matchService.createMatch).toHaveBeenCalledTimes(2);
      expect(matchService.finishMatch).toHaveBeenCalledTimes(1);
      expect(matchService.finishMatch).toHaveBeenCalledWith(302, 'USER', 1, 'b');
    });

    it('persistOnlineResult logs and continues when MatchService persistence fails', async () => {
      const persistError = new Error('persist failed');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const matchService = {
        createMatch: vi.fn()
            .mockResolvedValueOnce(401)
            .mockRejectedValueOnce(persistError),
        finishMatch: vi.fn().mockResolvedValue(undefined),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          {},
          matchService as any,
      );

      await service.createSession(
          'm-persist-error',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-persist-error', 1);

      expect(errorSpy).toHaveBeenCalledWith(
          '[OnlineSessionService] Failed to persist result for user',
          2,
          persistError,
      );

      errorSpy.mockRestore();
    });

    it('declineRematch is a no-op when request does not exist', async () => {
      const io = {
        to: vi.fn(() => ({ emit })),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { io },
      );

      await expect(
          service.declineRematch('missing-rematch', 1),
      ).resolves.toBeUndefined();

      expect(io.to).not.toHaveBeenCalled();
    });

    it('declineRematch rejects when user is not part of the session', async () => {
      const { service } = await setup();

      await service.abandon('m1', 1);
      await service.requestRematch('m1', 1);

      await expect(
          service.declineRematch('m1', 999),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'User is not part of this session',
      });
    });

    it('declineRematch notifies opponent when requester cancels the rematch', async () => {
      const { service, io } = await setup();

      await service.abandon('m1', 1);
      await service.requestRematch('m1', 1);

      emit.mockClear();
      vi.mocked(io.to).mockClear();

      await service.declineRematch('m1', 1);

      expect(io.to).toHaveBeenCalledWith('user:2');
      expect(emit).toHaveBeenCalledWith('rematch:declined', { matchId: 'm1' });
    });

    it('declineRematch notifies requester when opponent declines the rematch', async () => {
      const { service, io } = await setup();

      await service.abandon('m1', 1);
      await service.requestRematch('m1', 1);

      emit.mockClear();
      vi.mocked(io.to).mockClear();

      await service.declineRematch('m1', 2);

      expect(io.to).toHaveBeenCalledWith('user:1');
      expect(emit).toHaveBeenCalledWith('rematch:declined', { matchId: 'm1' });
    });

    it('declineRematch deletes request without notifying when requester cancels but original state is gone', async () => {
      const repository = new OnlineSessionRepository();
      const io = {
        to: vi.fn(() => ({ emit })),
      };

      const service = new OnlineSessionService(
          repository,
          new TurnTimerService(),
          25,
          60,
          { io },
      );

      await service.createSession(
          'm-decline-missing-state',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-decline-missing-state', 1);
      await service.requestRematch('m-decline-missing-state', 1);
      await repository.delete('m-decline-missing-state');

      emit.mockClear();
      vi.mocked(io.to).mockClear();

      await service.declineRematch('m-decline-missing-state', 1);

      expect(io.to).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('getPendingRematchForUser returns null when there is no pending rematch', async () => {
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
      );

      await expect(service.getPendingRematchForUser(2)).resolves.toBeNull();
    });

    it('getPendingRematchForUser returns pending rematch for opponent', async () => {
      const { service } = await setup();

      await service.abandon('m1', 1);
      await service.requestRematch('m1', 1);

      const pending = await service.getPendingRematchForUser(2);

      expect(pending).toMatchObject({
        matchId: 'm1',
        requesterId: 1,
        requesterName: 'a',
        size: 3,
        rules: {
          pieRule: { enabled: false },
          honey: { enabled: false, blockedCells: [] },
        },
      });
      expect(pending?.expiresAt).toEqual(expect.any(Number));
    });

    it('getPendingRematchForUser deletes stale pending pointer when request does not exist', async () => {
      const { redis, store } = createFakeRedis();

      store.set('rematch:pending:user:2', 'missing-rematch');

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { redis },
      );

      await expect(service.getPendingRematchForUser(2)).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith('rematch:pending:user:2');
    });

    it('getPendingRematchForUser deletes expired redis rematch request', async () => {
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
      const { redis } = createFakeRedis();

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { redis },
      );

      await service.createSession(
          'm-expired-redis-rematch',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-expired-redis-rematch', 1);
      await service.requestRematch('m-expired-redis-rematch', 1);

      nowSpy.mockReturnValue(71_001);

      await expect(service.getPendingRematchForUser(2)).resolves.toBeNull();

      expect(redis.del).toHaveBeenCalledWith('rematch:pending:user:2');

      nowSpy.mockRestore();
    });

    it('getPendingRematchForUser deletes pending pointer when request belongs to another opponent', async () => {
      const { service } = await setup();

      await service.abandon('m1', 1);
      await service.requestRematch('m1', 1);

      (service as any).rematchRequestsByUser.set(999, 'm1');

      await expect(service.getPendingRematchForUser(999)).resolves.toBeNull();

      expect((service as any).rematchRequestsByUser.has(999)).toBe(false);
    });

    it('getPendingRematchForUser deletes rematch request when original state no longer exists', async () => {
      const repository = new OnlineSessionRepository();

      const service = new OnlineSessionService(
          repository,
          new TurnTimerService(),
      );

      await service.createSession(
          'm-pending-missing-state',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-pending-missing-state', 1);
      await service.requestRematch('m-pending-missing-state', 1);
      await repository.delete('m-pending-missing-state');

      await expect(service.getPendingRematchForUser(2)).resolves.toBeNull();

      expect((service as any).rematchRequests.has('m-pending-missing-state')).toBe(false);
    });

    it('getPendingRematchForUser deletes rematch request when original state is not terminal', async () => {
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
      );

      await service.createSession(
          'm-active-pending-rematch',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await (service as any).saveRematchRequest('m-active-pending-rematch', {
        requesterId: 1,
        requesterName: 'a',
        opponentId: 2,
        matchId: 'm-active-pending-rematch',
        expiresAt: Date.now() + 60_000,
      });

      await expect(service.getPendingRematchForUser(2)).resolves.toBeNull();

      expect((service as any).rematchRequests.has('m-active-pending-rematch')).toBe(false);
    });

    it('getPendingRematchForUser deletes rematch request when pending user is not part of original session', async () => {
      const { service } = await setup();

      await service.abandon('m1', 1);

      await (service as any).saveRematchRequest('m1', {
        requesterId: 1,
        requesterName: 'a',
        opponentId: 999,
        matchId: 'm1',
        expiresAt: Date.now() + 60_000,
      });

      await expect(service.getPendingRematchForUser(999)).resolves.toBeNull();

      expect((service as any).rematchRequests.has('m1')).toBe(false);
    });

    it('rematch request lifecycle works with redis storage', async () => {
      const { redis } = createFakeRedis();

      const io = {
        to: vi.fn(() => ({ emit })),
      };

      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
          25,
          60,
          { redis, io },
      );

      await service.createSession(
          'm-redis-rematch',
          3,
          [{ userId: 1, username: 'a' }, { userId: 2, username: 'b' }],
          'HUMAN',
      );

      await service.abandon('m-redis-rematch', 1);
      await service.requestRematch('m-redis-rematch', 1);

      expect(redis.set).toHaveBeenCalledWith(
          'rematch:m-redis-rematch',
          expect.any(String),
          { EX: 60 },
      );
      expect(redis.set).toHaveBeenCalledWith(
          'rematch:pending:user:2',
          'm-redis-rematch',
          { EX: 60 },
      );

      const pending = await service.getPendingRematchForUser(2);

      expect(pending).toMatchObject({
        matchId: 'm-redis-rematch',
        requesterId: 1,
        requesterName: 'a',
        size: 3,
      });

      emit.mockClear();
      vi.mocked(io.to).mockClear();

      await service.declineRematch('m-redis-rematch', 2);

      expect(redis.del).toHaveBeenCalledWith('rematch:m-redis-rematch');
      expect(redis.del).toHaveBeenCalledWith('rematch:pending:user:2');
      expect(io.to).toHaveBeenCalledWith('user:1');
      expect(emit).toHaveBeenCalledWith('rematch:declined', {
        matchId: 'm-redis-rematch',
      });
    });

    it('secureRandomInt returns a value inside requested range', () => {
      const service = new OnlineSessionService(
          new OnlineSessionRepository(),
          new TurnTimerService(),
      );

      const value = (service as any).secureRandomInt(10);

      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    });
  });
});

describe('OnlineSessionService friend match invites', () => {
  it('creates a pending invite, emits it to the friend, and accepts it as an unranked session', async () => {
    const emit = vi.fn();
    const io = {
      to: vi.fn(() => ({ emit })),
    };
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService(), 25, 60, { io });

    const invite = await service.createFriendInvite(
        { userId: 1, username: 'alice' },
        { userId: 2, username: 'bea' },
        5,
        { pieRule: { enabled: true }, honey: { enabled: false, blockedCells: [] } },
        1_000,
    );

    expect(invite).toMatchObject({ requesterId: 1, recipientId: 2, boardSize: 5, ranked: false, source: 'friend', status: 'pending' });
    expect(io.to).toHaveBeenCalledWith('user:2');
    expect(io.to).toHaveBeenCalledWith('user:1');
    expect(emit).toHaveBeenCalledWith('friend-match:invited', expect.objectContaining({ inviteId: invite.inviteId, source: 'friend' }));
    expect(emit).toHaveBeenCalledWith('friend-match:sent', expect.objectContaining({ inviteId: invite.inviteId, source: 'friend' }));

    const pending = await service.getPendingFriendInviteForUser(2, 1_001);
    const outgoing = await service.getOutgoingFriendInviteForUser(1, 1_001);
    expect(pending?.inviteId).toBe(invite.inviteId);
    expect(outgoing?.inviteId).toBe(invite.inviteId);

    const ready = await service.acceptFriendInvite(invite.inviteId, 2, 1_002);
    expect(ready).toMatchObject({ boardSize: 5, ranked: false, source: 'friend' });
    expect(ready.players).toEqual([
      { userId: 1, username: 'alice', symbol: 'B' },
      { userId: 2, username: 'bea', symbol: 'R' },
    ]);

    const snapshot = await service.getSnapshot(ready.matchId);
    expect(snapshot?.ranked).toBe(false);
    expect(snapshot?.source).toBe('friend');
    expect(await service.getPendingFriendInviteForUser(2, 1_003)).toBeNull();
    expect(await service.getOutgoingFriendInviteForUser(1, 1_003)).toBeNull();
  });

  it('rejects accepting an invite by a user who is not the recipient', async () => {
    const service = new OnlineSessionService(new OnlineSessionRepository(), new TurnTimerService());
    const invite = await service.createFriendInvite(
        { userId: 1, username: 'alice' },
        { userId: 2, username: 'bea' },
        5,
    );

    await expect(service.acceptFriendInvite(invite.inviteId, 3)).rejects.toMatchObject({ code: 'FRIEND_INVITE_FORBIDDEN' });
  });
});

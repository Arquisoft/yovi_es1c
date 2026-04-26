import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, setupAuthenticatedUser, clearAuth, screen } from './test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, waitFor, act } from '@testing-library/react';
import GameUI from '../features/game/ui/tsx/GameUI';
import * as useGameControllerModule from '../features/game/hooks/useGameController';
import { resolveCurrentTurnLabel,  resolveWinnerLabel, resolveGameOverText} from '../features/game';
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient';
import { useOnlineSession } from '../features/game/hooks/useOnlineSession';
import { useChatSession } from '../features/game/hooks/useChatSession';
import type { TFunction } from 'i18next';
import type { GameMessage } from '../features/game/hooks/useGameController';

vi.mock('../features/game/hooks/useGameController');
vi.mock('../features/game/hooks/useOnlineSession', () => ({ useOnlineSession: vi.fn() }));
vi.mock('../features/game/hooks/useChatSession', () => ({ useChatSession: vi.fn() }));
vi.mock('../features/game/ui/tsx/Board.tsx', () => ({
    Board: ({ onCellClick, blockedCells }: any) => (
        <div>
            <button onClick={() => onCellClick(0, 0)}>BoardMock</button>
            <span data-testid="blocked-cells-count">{blockedCells?.length ?? 0}</span>
        </div>
    ),
}));
vi.mock('../features/game/ui/tsx/TurnTimer', () => ({
    default: ({ onExpire }: { onExpire: () => void }) => (
        <button onClick={onExpire}>ExpireTurn</button>
    ),
}));


vi.mock('../features/game/ui/tsx/WinnerOverlay', () => ({
    default: ({
                  winnerLabel,
                  onNewGame,
                  onNavigateHome,
                  isOnline,
                  rematchState,
                  rematchRequesterName,
                  onRequestRematch,
                  onAcceptRematch,
                  onDeclineRematch,
              }: {
        winnerLabel: string;
        onNewGame: () => void;
        onNavigateHome: () => void;
        isOnline?: boolean;
        rematchState?: string;
        rematchRequesterName?: string;
        onRequestRematch?: () => void;
        onAcceptRematch?: () => void;
        onDeclineRematch?: () => void;
    }) => (
        <div>
            <span>{winnerLabel}</span>
            <span data-testid="rematch-state">{rematchState ?? 'none'}</span>
            {rematchRequesterName && <span>{rematchRequesterName}</span>}

            <button onClick={onNewGame}>WinnerOverlayNewGame</button>
            <button onClick={onNavigateHome}>WinnerOverlayHome</button>

            {isOnline && (
                <>
                    <button onClick={onRequestRematch}>RequestRematch</button>
                    <button onClick={onAcceptRematch}>AcceptRematch</button>
                    <button onClick={onDeclineRematch}>DeclineRematch</button>
                </>
            )}
        </div>
    ),
}));

vi.mock('../features/game/realtime/onlineSocketClient', () => ({
    onlineSocketClient: { emit: vi.fn() },
}));

const renderWithConfigAndRoutes = (stateConfig: any) => {
    return renderWithProviders(
        <MemoryRouter initialEntries={[{ pathname: '/gamey', state: stateConfig }]}>
            <Routes>
                <Route path="/gamey" element={<GameUI />} />
                <Route path="/create-match" element={<div>CreateMatchPage</div>} />
            </Routes>
        </MemoryRouter>,
        { withRouter: false },
    );
};

const t = ((key: string, options?: any) => {
    if (key === 'winnerMessage') {
        return `¡Ganador: ${options?.name}!`;
    }
    if (key === 'gameOver') return '¡Partida terminada!';
    else if (key === 'player1') return 'Jugador 1'
    else if (key === 'player2') return 'Jugador 2'
    return key;
}) as unknown as TFunction;

const mockMessage: GameMessage = {
    key: "clickACellToPlay"
};

describe('GameUI Component', () => {
    const mockActions = {
        newGame: vi.fn(),
        handleCellClick: vi.fn(),
        selectMode: vi.fn(),
        changeSize: vi.fn(),
        applyPieSwap: vi.fn(),
    };

    const mockState = {
        gameMode: 'BOT' as const,
        gameState: {
            layout: '.../../../....',
            size: 8,
            turn: 0,
            players: ['B', 'R'],
            rules: {
                pieRule: { enabled: false },
                honey: { enabled: false, blockedCells: [] },
            },
        },
        loading: false,
        error: null,
        message: '',
        gameOver: false,
        isBoardFull: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        clearAuth();
        setupAuthenticatedUser();
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: null,
            error: null,
            connectionStatus: 'CONNECTED',
            playMove: vi.fn(),
        } as any);
        vi.mocked(useChatSession).mockReturnValue({ messages: [], sendMessage: vi.fn() } as any);

        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                message: { key: "clickACellToPlay" },
            },
            actions: mockActions,
        });
    });

    const renderWithConfig = (stateConfig: any) => {
        return renderWithProviders(
            <MemoryRouter initialEntries={[{ pathname: '/gamey', state: stateConfig }]}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>,
            { withRouter: false },
        );
    };
    const buildFinishedOnlineSession = (matchId = 'online-rematch') => ({
        matchId,
        layout: 'B/R./B..',
        size: 3,
        rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
        turn: 0,
        version: 5,
        timerEndsAt: Date.now() + 10000,
        players: [
            { userId: 1, username: 'yo', symbol: 'B' as const },
            { userId: 2, username: 'rival', symbol: 'R' as const },
        ],
        winner: 'B' as const,
    });

    const mockOnlineRematchSession = (matchId = 'online-rematch') => {
        const requestRematch = vi.fn();
        const acceptRematch = vi.fn();
        const declineRematch = vi.fn();

        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: buildFinishedOnlineSession(matchId),
            error: null,
            connectionStatus: 'CONNECTED',
            playMove: vi.fn(),
            applyPieSwapOnline: vi.fn(),
            emitTurnTimeout: vi.fn(),
            requestRematch,
            acceptRematch,
            declineRematch,
        } as any);

        return {
            requestRematch,
            acceptRematch,
            declineRematch,
        };
    };

    it('shows fallback when no config is provided', () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/gamey']}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>,
            { withRouter: false },
        );

        expect(screen.getByText(/No se encontró la configuración de la partida/i)).toBeInTheDocument();
    });

    it('triggers local handleCellClick when board is clicked in BOT mode', () => {
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        fireEvent.click(screen.getByRole('button', { name: 'BoardMock' }));
        expect(mockActions.handleCellClick).toHaveBeenCalledWith(0, 0);
    });

    it('shows pie action button only when pie rule can be used in LOCAL_2P', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameMode: 'LOCAL_2P',
                message: { key: "clickACellToPlay" },
                gameState: {
                    ...mockState.gameState,
                    layout: 'B/../...',
                    turn: 1,
                    rules: {
                        pieRule: { enabled: true },
                        honey: { enabled: false, blockedCells: [] },
                    },
                },
            },
            actions: { ...mockActions, applyPieSwap: vi.fn() } as any,
        });
        renderWithConfig({ boardSize: 3, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByRole('button', { name: /Aplicar Pie Rule/i })).toBeInTheDocument();
    });

    it('passes honey blocked cells to board rendering', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                message: { key: "clickACellToPlay" },
                gameState: {
                    ...mockState.gameState,
                    rules: {
                        pieRule: { enabled: false },
                        honey: { enabled: true, blockedCells: [{ row: 1, col: 0 }] },
                    },
                },
            },
            actions: mockActions as any,
        });
        renderWithConfig({ boardSize: 3, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByTestId('blocked-cells-count')).toHaveTextContent('1');
    });

    it('does not show pie action button outside eligible flow', () => {
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.queryByRole('button', { name: /Aplicar Pie Rule/i })).not.toBeInTheDocument();
    });

    it('renders online session data and chat in ONLINE mode', () => {
        const playMove = vi.fn();
        const applyPieSwapOnline = vi.fn();
        const sendMessage = vi.fn();
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: {
                matchId: 'online-1',
                layout: 'B/..',
                size: 2,
                rules: { pieRule: { enabled: true }, honey: { enabled: false, blockedCells: [] } },
                turn: 1,
                version: 0,
                timerEndsAt: Date.now() + 10000,
                players: [{ userId: 1, username: 'yo', symbol: 'B' }, { userId: 2, username: 'rival', symbol: 'R' }],
                winner: null,
            },
            error: null,
            connectionStatus: 'CONNECTED',
            playMove,
            applyPieSwapOnline,
            emitTurnTimeout: vi.fn(),
        } as any);
        vi.mocked(useChatSession).mockReturnValue({
            messages: [{ userId: 2, username: 'rival', text: 'hola', timestamp: 1 }],
            sendMessage,
        } as any);

        renderWithConfig({ boardSize: 2, mode: 'ONLINE', difficulty: 'medium', matchId: 'online-1' });

        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getByText('Chat')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'BoardMock' }));
        expect(playMove).toHaveBeenCalledWith(0, 0);
        fireEvent.click(screen.getByRole('button', { name: /Aplicar Pie Rule/i }));
        expect(applyPieSwapOnline).toHaveBeenCalled();
    });

    describe('resolveCurrentTurnLabel', () => {
        const players = [
            { username: 'Alice' },
            { username: 'Bob' },
        ];

        describe('resolveCurrentTurnLabel', () => {

            it('online turn=0 → primer jugador', () => {
                expect(resolveCurrentTurnLabel(true, 0, players, 'ONLINE', t)).toBe('Alice');
            });

            it('online turn=1 → segundo jugador', () => {
                expect(resolveCurrentTurnLabel(true, 1, players, 'ONLINE', t)).toBe('Bob');
            });

            it('online sin jugadores → fallback', () => {
                expect(resolveCurrentTurnLabel(true, 0, [], 'ONLINE', t)).toBe('Jugador 1');
                expect(resolveCurrentTurnLabel(true, 1, [], 'ONLINE', t)).toBe('Jugador 2');
            });

            it('local BOT turn=0 → Jugador 1', () => {
                expect(resolveCurrentTurnLabel(false, 0, players, 'BOT', t)).toBe('Jugador 1');
            });

            it('local BOT turn=1 → Bot', () => {
                expect(resolveCurrentTurnLabel(false, 1, players, 'BOT', t)).toBe('Bot');
            });

            it('local LOCAL_2P turn=1 → Jugador 2', () => {
                expect(resolveCurrentTurnLabel(false, 1, players, 'LOCAL_2P', t)).toBe('Jugador 2');
            });
        });
    });

    describe('resolveWinnerLabel', () => {
        const players = [{ username: 'Alice' }, { username: 'Bob' }];

        it('B → primer jugador', () => {
            expect(resolveWinnerLabel('B', players, t)).toBe('Alice');
        });

        it('R → segundo jugador', () => {
            expect(resolveWinnerLabel('R', players, t)).toBe('Bob');
        });

        it('null → null', () => {
            expect(resolveWinnerLabel(null, players, t)).toBeNull();
        });

        it('B sin jugadores → fallback', () => {
            expect(resolveWinnerLabel('B', [], t)).toBe('Jugador 1');
        });
    });

    describe('resolveGameOverText', () => {
        it('null → mensaje genérico', () => {
            expect(resolveGameOverText(null, t)).toBe('¡Partida terminada!');
        });

        it('nombre → mensaje ganador', () => {
            expect(resolveGameOverText('Alice', t)).toBe('¡Ganador: Alice!');
        });
    });

    it('shows error message when state.error is set', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                error: 'Algo salió mal',
                message: mockMessage,
            },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText(/Algo salió mal/i)).toBeInTheDocument();
    });

    it('shows fallback component NoConfigFallback when no state is provided', () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/gamey']}>
                <Routes><Route path="/gamey" element={<GameUI />} /></Routes>
            </MemoryRouter>,
            { withRouter: false },
        );
        expect(screen.getByRole('button')).toBeInTheDocument();
        expect(screen.getByText(/No se encontró la configuración de la partida/i)).toBeInTheDocument();
    });

    it('calls onNavigate when NoConfigFallback button is clicked', () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/gamey']}>
                <Routes><Route path="/gamey" element={<GameUI />} /></Routes>
            </MemoryRouter>,
            { withRouter: false },
        );
        fireEvent.click(screen.getByRole('button'));
        expect(screen.queryByText(/No se encontró/i)).not.toBeInTheDocument();
    });

    it('shows terminal online error without forcing navigation', () => {
        const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: null,
            error: { code: 'RECONNECT_EXPIRED', message: 'expired' },
            connectionStatus: 'DISCONNECTED',
            isTerminalError: true,
            playMove: vi.fn(),
        } as any);
        renderWithConfig({ boardSize: 8, mode: 'ONLINE', difficulty: 'easy', matchId: 'm5' });
        expect(screen.getByText('expired')).toBeInTheDocument();
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('does NOT navigate on non-terminal online error', async () => {
        const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: null,
            error: { code: 'NOT_YOUR_TURN', message: 'Wait' },
            connectionStatus: 'CONNECTED',
            playMove: vi.fn(),
        } as any);
        renderWithConfig({ boardSize: 8, mode: 'ONLINE', difficulty: 'easy', matchId: 'm6' });
        await waitFor(() => {}, { timeout: 200 });
        expect(alertSpy).not.toHaveBeenCalled();
        alertSpy.mockRestore();
    });

    it('uses Bot as second player name in BOT mode', () => {
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText(/Bot/i)).toBeInTheDocument();
    });

    it('shows "2 Jugadores" as mode label in LOCAL_2P mode', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameMode: 'LOCAL_2P',
                message: { key: "clickACellToPlay" },
            },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText('2 Jugadores')).toBeInTheDocument();
    });

    it('does not show "Bot" label in LOCAL_2P mode', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameMode: 'LOCAL_2P',
                message: { key: "clickACellToPlay" },
            },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });
        expect(screen.queryByText(/^Bot$/i)).not.toBeInTheDocument();
    });

    it('emits turn:timeout when online timer expires', () => {
        vi.mocked(useOnlineSession).mockReturnValue({
            emitTurnTimeout: () => {
                onlineSocketClient.emit('turn:timeout', { matchId: 'online-1', version: 7 });
            },
            sessionState: {
                matchId: 'online-1',
                layout: '. /..'.replace(/ /g, ''),
                size: 2,
                rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
                turn: 1,
                version: 7,
                timerEndsAt: Date.now() + 10000,
                players: [
                    { userId: 1, username: 'yo', symbol: 'B' },
                    { userId: 2, username: 'rival', symbol: 'R' },
                ],
                winner: null,
            },
            error: null,
            connectionStatus: 'CONNECTED',
            playMove: vi.fn(),
        } as any);

        renderWithConfig({ boardSize: 2, mode: 'ONLINE', difficulty: 'medium', matchId: 'online-1' });

        fireEvent.click(screen.getByRole('button', { name: 'ExpireTurn' }));

        expect(onlineSocketClient.emit).toHaveBeenCalledWith('turn:timeout', {
            matchId: 'online-1',
            version: 7,
        });
    });

    it('navigates to /create-match when clicking "Nueva Partida"', () => {
        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        fireEvent.click(screen.getByRole('button', { name: 'Nueva Partida' }));

        expect(screen.getByText('Nueva Partida')).toBeInTheDocument();
    });

    it('renders offline winner label for player 1 when turn points to player 2', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });


        renderWithConfigAndRoutes({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('¡Felicidades, Jugador 1 gana!')).toBeInTheDocument();
    });

    it('renders offline winner label for player 2 when turn points to player 1', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 0 },
            },
            actions: mockActions,
        });


        renderWithConfigAndRoutes({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('¡Felicidades, Jugador 2 gana!')).toBeInTheDocument();
    });

    it('renders BOT winner as human when next turn is bot', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('¡Felicidades, testuser. Has ganado al bot!!!')).toBeInTheDocument();
    });

    it('renders BOT winner as bot when next turn is player 1', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 0 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('Bot ha ganado a testuser.')).toBeInTheDocument();
    });

    it('calls actions.newGame from WinnerOverlay', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        fireEvent.click(screen.getByRole('button', { name: 'WinnerOverlayNewGame' }));

        expect(mockActions.newGame).toHaveBeenCalled();
    });

    it('navigates to /create-match from WinnerOverlay', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                message: { key: "clickACellToPlay" },
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        fireEvent.click(screen.getByRole('button', { name: 'WinnerOverlayHome' }));

        expect(screen.getByText('CreateMatchPage')).toBeInTheDocument();
    });

    describe('manejo de VERSION_CONFLICT en modo ONLINE', () => {
        const onlineConfig = { boardSize: 3, mode: 'ONLINE', difficulty: 'easy', matchId: 'online-err' };

        const onlineSession = (errorCode: string | null, msg = 'err msg') => ({
            sessionState: {
                matchId: 'online-err',
                layout: 'B/..',
                size: 3,
                rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
                turn: 1,
                version: 2,
                timerEndsAt: Date.now() + 10000,
                players: [
                    { userId: 1, username: 'yo', symbol: 'B' as const },
                    { userId: 2, username: 'rival', symbol: 'R' as const },
                ],
                winner: null,
            },
            error: errorCode ? { code: errorCode, message: msg } : null,
            connectionStatus: 'CONNECTED' as const,
            isTerminalError: ['SESSION_NOT_FOUND', 'RECONNECT_EXPIRED', 'SESSION_TERMINAL', 'UNAUTHORIZED'].includes(errorCode ?? ''),
            playMove: vi.fn(),
            applyPieSwapOnline: vi.fn(),
        });

        it('VERSION_CONFLICT: muestra aviso menor (warning) y NO el error principal', () => {
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession('VERSION_CONFLICT', 'Version mismatch') as any);
            renderWithConfig(onlineConfig);

            expect(screen.getByText('Version mismatch')).toBeInTheDocument();

            const warningEl = screen.getByText('Version mismatch');
            expect(warningEl.tagName).toBe('SPAN');
        });

        it('NOT_YOUR_TURN: muestra aviso menor y NO navega fuera', async () => {
            const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession('NOT_YOUR_TURN', 'Wait your turn') as any);
            renderWithConfig(onlineConfig);

            expect(screen.getByText('Wait your turn')).toBeInTheDocument();
            await waitFor(() => {}, { timeout: 200 });
            expect(alertSpy).not.toHaveBeenCalled();
            alertSpy.mockRestore();
        });

        it('DUPLICATE_EVENT: muestra aviso menor y NO navega fuera', async () => {
            const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession('DUPLICATE_EVENT', 'Already processed') as any);
            renderWithConfig(onlineConfig);

            expect(screen.getByText('Already processed')).toBeInTheDocument();
            await waitFor(() => {}, { timeout: 200 });
            expect(alertSpy).not.toHaveBeenCalled();
            alertSpy.mockRestore();
        });

        it('INVALID_MOVE: se muestra como error principal (Paper rojo), no como warning', () => {
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession('INVALID_MOVE', 'Movimiento inválido') as any);
            renderWithConfig(onlineConfig);

            expect(screen.getByText('Movimiento inválido')).toBeInTheDocument();
            expect(screen.getByText('Movimiento inválido').tagName).not.toBe('SPAN');
        });

        it('sin error: no se renderiza ningún Paper de error ni warning', () => {
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession(null) as any);
            renderWithConfig(onlineConfig);

            expect(screen.queryByText('err msg')).not.toBeInTheDocument();
        });

        it('RECONNECT_EXPIRED: muestra error terminal y mantiene la pantalla', async () => {
            const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
            vi.mocked(useOnlineSession).mockReturnValue(onlineSession('RECONNECT_EXPIRED', 'Reconexión expirada') as any);
            renderWithConfigAndRoutes(onlineConfig);

            expect(screen.getByText('Reconexión expirada')).toBeInTheDocument();
            await waitFor(() => {}, { timeout: 200 });
            expect(alertSpy).not.toHaveBeenCalled();
            alertSpy.mockRestore();
        });
    });
    describe('resolveGameMessage coverage', () => {
        const renderWithGameMessage = (message: GameMessage | null) => {
            vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
                state: {
                    ...mockState,
                    loading: true,
                    message,
                },
                actions: mockActions,
            } as any);

            renderWithConfig({
                boardSize: 8,
                mode: 'BOT',
                difficulty: 'easy',
                matchId: 'm-message',
            });
        };

        it('renders simple game messages', () => {
            const cases: Array<{ message: GameMessage; expected: string }> = [
                { message: { key: 'clickACellToPlay' }, expected: 'Haz clic en una celda para jugar' },
                { message: { key: 'botThinking' }, expected: 'El bot está pensando...' },
                { message: { key: 'errorCommunicatingWithBot' }, expected: 'Error al comunicarse con el bot' },
                { message: { key: 'onlineWaitingServer' }, expected: 'Esperando al servidor en línea...' },
                { message: { key: 'invalidBotMove' }, expected: 'El bot sugirió un movimiento inválido, inténtalo de nuevo' },
                { message: { key: 'pieRuleApplied' }, expected: 'Pie Rule aplicada' },
            ];

            for (const { message, expected } of cases) {
                vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
                    state: {
                        ...mockState,
                        loading: true,
                        message,
                    },
                    actions: mockActions,
                } as any);

                const { unmount } = renderWithConfig({
                    boardSize: 8,
                    mode: 'BOT',
                    difficulty: 'easy',
                    matchId: `m-${message.key}`,
                });

                expect(screen.getByText(expected)).toBeInTheDocument();
                unmount();
            }
        });

        it('renders winnerAnnouncement using labelKey', () => {
            renderWithGameMessage({
                key: 'winnerAnnouncement',
                params: { labelKey: 'player1' },
            });

            expect(screen.getByText('¡Felicidades, Jugador 1 gana!')).toBeInTheDocument();
        });

        it('renders winnerAnnouncement using direct label fallback', () => {
            renderWithGameMessage({
                key: 'winnerAnnouncement',
                params: { label: 'Alice' },
            });

            expect(screen.getByText('¡Felicidades, Alice gana!')).toBeInTheDocument();
        });

        it('renders turnMessage using labelKey', () => {
            renderWithGameMessage({
                key: 'turnMessage',
                params: { labelKey: 'player2' },
            });

            expect(screen.getByText('Turno: Jugador 2')).toBeInTheDocument();
        });

        it('renders turnMessage using direct label fallback', () => {
            renderWithGameMessage({
                key: 'turnMessage',
                params: { label: 'Alice' },
            });

            expect(screen.getByText('Turno: Alice')).toBeInTheDocument();
        });

        it('renders botPlayed with fallback text', () => {
            renderWithGameMessage({
                key: 'botPlayed',
                params: {
                    row: 1,
                    col: 2,
                    fallback: ' [fallback: easy_fast]',
                },
            });

            expect(screen.getByText('El bot jugó en (1, 2) [fallback: easy_fast]')).toBeInTheDocument();
        });

        it('renders botPlayed without fallback text', () => {
            renderWithGameMessage({
                key: 'botPlayed',
                params: {
                    row: 1,
                    col: 2,
                },
            });

            expect(screen.getByText('El bot jugó en (1, 2)')).toBeInTheDocument();
        });

        it('handles null game message', () => {
            renderWithGameMessage(null);

            expect(screen.getByRole('button', { name: 'BoardMock' })).toBeInTheDocument();
        });

        it('handles unknown game message key through default branch', () => {
            renderWithGameMessage({ key: 'unknown-message' } as any);

            expect(screen.getByRole('button', { name: 'BoardMock' })).toBeInTheDocument();
        });
    });

    describe('online rematch callbacks coverage', () => {
        it('sets incoming rematch state only when requested payload belongs to current match', () => {
            mockOnlineRematchSession('online-rematch');

            renderWithConfig({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'easy',
                matchId: 'online-rematch',
            });

            const callbacks = vi.mocked(useOnlineSession).mock.calls.at(-1)?.[1];

            act(() => {
                callbacks?.onRequested?.({
                    matchId: 'other-match',
                    requesterName: 'Ignored player',
                });
            });

            expect(screen.getByTestId('rematch-state')).toHaveTextContent('idle');
            expect(screen.queryByText('Ignored player')).not.toBeInTheDocument();

            act(() => {
                callbacks?.onRequested?.({
                    matchId: 'online-rematch',
                    requesterName: 'Alice',
                });
            });

            expect(screen.getByTestId('rematch-state')).toHaveTextContent('incoming');
            expect(screen.getByText('Alice')).toBeInTheDocument();
        });

        it('navigates to the new online rematch when rematch is ready', async () => {
            mockOnlineRematchSession('online-rematch');

            renderWithConfigAndRoutes({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'medium',
                matchId: 'online-rematch',
            });

            const callbacks = vi.mocked(useOnlineSession).mock.calls.at(-1)?.[1];

            act(() => {
                callbacks?.onReady?.({
                    newMatchId: 'online-new-match',
                    size: 5,
                    rules: {
                        pieRule: { enabled: true },
                        honey: { enabled: false, blockedCells: [] },
                    },
                    players: [
                        { userId: 2, username: 'rival', symbol: 'B' },
                        { userId: 1, username: 'yo', symbol: 'R' },
                    ],
                });
            });

            await waitFor(() => {
                expect(useGameControllerModule.useGameController).toHaveBeenCalledWith(
                    5,
                    'LOCAL_2P',
                    undefined,
                    'online-new-match',
                    'medium',
                    {
                        pieRule: { enabled: true },
                        honey: { enabled: false, blockedCells: [] },
                    },
                );
            });
        });

        it('ignores duplicated rematch ready payloads emitted before the route state is reset', async () => {
            mockOnlineRematchSession('online-rematch');

            renderWithConfigAndRoutes({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'easy',
                matchId: 'online-rematch',
            });

            const callbacks = vi.mocked(useOnlineSession).mock.calls.at(-1)?.[1];

            await act(async () => {
                callbacks?.onReady?.({
                    newMatchId: 'online-first-rematch',
                    size: 4,
                    rules: {
                        pieRule: { enabled: false },
                        honey: { enabled: false, blockedCells: [] },
                    },
                    players: [
                        { userId: 2, username: 'rival', symbol: 'B' },
                        { userId: 1, username: 'yo', symbol: 'R' },
                    ],
                });

                callbacks?.onReady?.({
                    newMatchId: 'online-second-rematch',
                    size: 6,
                    rules: {
                        pieRule: { enabled: true },
                        honey: { enabled: false, blockedCells: [] },
                    },
                    players: [
                        { userId: 2, username: 'rival', symbol: 'B' },
                        { userId: 1, username: 'yo', symbol: 'R' },
                    ],
                });
            });

            await waitFor(() => {
                expect(useGameControllerModule.useGameController).toHaveBeenCalledWith(
                    4,
                    'LOCAL_2P',
                    undefined,
                    'online-first-rematch',
                    'easy',
                    {
                        pieRule: { enabled: false },
                        honey: { enabled: false, blockedCells: [] },
                    },
                );
            });

            expect(
                vi.mocked(useGameControllerModule.useGameController).mock.calls.some(
                    (call) => call[3] === 'online-second-rematch',
                ),
            ).toBe(false);
        });

        it('clears rematch state only when declined payload belongs to current match', () => {
            mockOnlineRematchSession('online-rematch');

            renderWithConfig({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'easy',
                matchId: 'online-rematch',
            });

            const callbacks = vi.mocked(useOnlineSession).mock.calls.at(-1)?.[1];

            act(() => {
                callbacks?.onRequested?.({
                    matchId: 'online-rematch',
                    requesterName: 'Alice',
                });
            });

            expect(screen.getByTestId('rematch-state')).toHaveTextContent('incoming');

            act(() => {
                callbacks?.onDeclined?.({
                    matchId: 'other-match',
                });
            });

            expect(screen.getByTestId('rematch-state')).toHaveTextContent('incoming');

            act(() => {
                callbacks?.onDeclined?.({
                    matchId: 'online-rematch',
                });
            });

            expect(screen.getByTestId('rematch-state')).toHaveTextContent('idle');
        });

        it('request rematch sends request and auto-declines after timeout', async () => {
            vi.useFakeTimers();

            try {
                const { requestRematch, declineRematch } = mockOnlineRematchSession('online-rematch');

                renderWithConfig({
                    boardSize: 3,
                    mode: 'ONLINE',
                    difficulty: 'easy',
                    matchId: 'online-rematch',
                });

                fireEvent.click(screen.getByRole('button', { name: 'RequestRematch' }));

                expect(requestRematch).toHaveBeenCalledWith('online-rematch');
                expect(screen.getByTestId('rematch-state')).toHaveTextContent('pending');

                await act(async () => {
                    vi.advanceTimersByTime(30_000);
                });

                expect(declineRematch).toHaveBeenCalledWith('online-rematch');
                expect(screen.getByTestId('rematch-state')).toHaveTextContent('idle');
            } finally {
                vi.useRealTimers();
            }
        });

        it('accept rematch sends accept event for current match', () => {
            const { acceptRematch } = mockOnlineRematchSession('online-rematch');

            renderWithConfig({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'easy',
                matchId: 'online-rematch',
            });

            fireEvent.click(screen.getByRole('button', { name: 'AcceptRematch' }));

            expect(acceptRematch).toHaveBeenCalledWith('online-rematch');
        });

        it('decline rematch sends decline event and resets state', () => {
            const { declineRematch } = mockOnlineRematchSession('online-rematch');

            renderWithConfig({
                boardSize: 3,
                mode: 'ONLINE',
                difficulty: 'easy',
                matchId: 'online-rematch',
            });

            fireEvent.click(screen.getByRole('button', { name: 'DeclineRematch' }));

            expect(declineRematch).toHaveBeenCalledWith('online-rematch');
            expect(screen.getByTestId('rematch-state')).toHaveTextContent('idle');
        });
    });
});
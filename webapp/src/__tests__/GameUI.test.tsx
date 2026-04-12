import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, setupAuthenticatedUser, clearAuth, screen } from './test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, waitFor } from '@testing-library/react';
import GameUI from '../features/game/ui/tsx/GameUI';
import * as useGameControllerModule from '../features/game/hooks/useGameController';
import { resolveCurrentTurnLabel,  resolveWinnerLabel, resolveGameOverText} from '../features/game';
import { onlineSocketClient } from '../features/game/realtime/onlineSocketClient';
import { useOnlineSession } from '../features/game/hooks/useOnlineSession';
import { useChatSession } from '../features/game/hooks/useChatSession';
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
              }: {
        winnerLabel: string;
        onNewGame: () => void;
        onNavigateHome: () => void;
    }) => (
        <div>
            <span>{winnerLabel}</span>
            <button onClick={onNewGame}>WinnerOverlayNewGame</button>
            <button onClick={onNavigateHome}>WinnerOverlayHome</button>
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
            state: mockState,
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

    it('renders the game title when config is provided', () => {
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText(/¡Tu partida de Y!/i)).toBeInTheDocument();
    });

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
        const sendMessage = vi.fn();
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: {
                matchId: 'online-1',
                layout: '. /..'.replace(/ /g, ''),
                size: 2,
                rules: { pieRule: { enabled: false }, honey: { enabled: false, blockedCells: [] } },
                turn: 1,
                version: 0,
                timerEndsAt: Date.now() + 10000,
                players: [{ userId: 1, username: 'yo', symbol: 'B' }, { userId: 2, username: 'rival', symbol: 'R' }],
                winner: null,
            },
            error: null,
            connectionStatus: 'CONNECTED',
            playMove,
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
    });

    describe('resolveCurrentTurnLabel', () => {
        const players = [
            { username: 'Alice' },
            { username: 'Bob' },
        ];

        it('online turn=0 → primer jugador', () => {
            expect(resolveCurrentTurnLabel(true, 0, players, 'ONLINE')).toBe('Alice');
        });
        it('online turn=1 → segundo jugador', () => {
            expect(resolveCurrentTurnLabel(true, 1, players, 'ONLINE')).toBe('Bob');
        });
        it('online sin jugadores → fallback', () => {
            expect(resolveCurrentTurnLabel(true, 0, [], 'ONLINE')).toBe('Jugador 1');
            expect(resolveCurrentTurnLabel(true, 1, [], 'ONLINE')).toBe('Jugador 2');
        });
        it('local BOT turn=0 → Jugador 1', () => {
            expect(resolveCurrentTurnLabel(false, 0, players, 'BOT')).toBe('Jugador 1');
        });
        it('local BOT turn=1 → Bot', () => {
            expect(resolveCurrentTurnLabel(false, 1, players, 'BOT')).toBe('Bot');
        });
        it('local LOCAL_2P turn=1 → Jugador 2', () => {
            expect(resolveCurrentTurnLabel(false, 1, players, 'LOCAL_2P')).toBe('Jugador 2');
        });
    });

    describe('resolveWinnerLabel', () => {
        const players = [{ username: 'Alice' }, { username: 'Bob' }];

        it('B → primer jugador', () => {
            expect(resolveWinnerLabel('B', players)).toBe('Alice');
        });
        it('R → segundo jugador', () => {
            expect(resolveWinnerLabel('R', players)).toBe('Bob');
        });
        it('null → null', () => {
            expect(resolveWinnerLabel(null, players)).toBeNull();
        });
        it('B sin jugadores → fallback', () => {
            expect(resolveWinnerLabel('B', [])).toBe('Jugador 1');
        });
    });

    describe('resolveGameOverText', () => {
        it('null → mensaje genérico', () => {
            expect(resolveGameOverText(null)).toBe('¡Partida terminada!');
        });
        it('nombre → mensaje ganador', () => {
            expect(resolveGameOverText('Alice')).toBe('¡Ganador: Alice!');
        });
    });
    it('shows "Bot pensando..." when loading is true in BOT mode', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, loading: true },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText(/Bot pensando/i)).toBeInTheDocument();
    });

    it('shows error message when state.error is set', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, error: 'Algo salió mal' },
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
        // El componente NoConfigFallback renderiza un botón de navegación
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
        // navega hacia atrás / a /create-match
        expect(screen.queryByText(/No se encontró/i)).not.toBeInTheDocument();
    });

    it('navigates to /create-match and alerts on terminal online error', async () => {
        const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: null,
            error: { code: 'RECONNECT_EXPIRED', message: 'expired' },
            connectionStatus: 'DISCONNECTED',
            playMove: vi.fn(),
        } as any);
        renderWithConfig({ boardSize: 8, mode: 'ONLINE', difficulty: 'easy', matchId: 'm5' });
        await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('La partida ya no está disponible'));
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
            state: { ...mockState, gameMode: 'LOCAL_2P' as const },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });
        expect(screen.getByText('2 Jugadores')).toBeInTheDocument();
    });

    it('does not show "Bot" label in LOCAL_2P mode', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, gameMode: 'LOCAL_2P' as const },
            actions: mockActions,
        });
        renderWithConfig({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });
        expect(screen.queryByText(/^Bot$/i)).not.toBeInTheDocument();
    });

    it('emits turn:timeout when online timer expires', () => {
        vi.mocked(useOnlineSession).mockReturnValue({
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

        expect(screen.getByText('CreateMatchPage')).toBeInTheDocument();
    });

    it('renders offline winner label for player 1', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('¡Felicidades, Jugador 1 gana!')).toBeInTheDocument();
    });

    it('renders offline winner label for player 2', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
                gameState: { ...mockState.gameState, turn: 0 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'LOCAL_2P', difficulty: 'easy', matchId: 'm1' });

        expect(screen.getByText('¡Felicidades, Jugador 2 gana!')).toBeInTheDocument();
    });

    it('calls actions.newGame from WinnerOverlay', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: {
                ...mockState,
                gameOver: true,
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
                gameState: { ...mockState.gameState, turn: 1 },
            },
            actions: mockActions,
        });

        renderWithConfigAndRoutes({ boardSize: 8, mode: 'BOT', difficulty: 'easy', matchId: 'm1' });

        fireEvent.click(screen.getByRole('button', { name: 'WinnerOverlayHome' }));

        expect(screen.getByText('CreateMatchPage')).toBeInTheDocument();
    });

});
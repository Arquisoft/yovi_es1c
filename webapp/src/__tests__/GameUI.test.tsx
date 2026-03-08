import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, setupAuthenticatedUser, clearAuth, screen } from "./test-utils";
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import * as useGameControllerModule from '../features/game/hooks/useGameController';

vi.mock('../features/game/hooks/useGameController');

describe('GameUI Component', () => {
    const mockActions = {
        newGame: vi.fn(),
        handleCellClick: vi.fn(),
        selectMode: vi.fn(),
        changeSize: vi.fn(),
    };

    const mockState = {
        gameMode: 'BOT' as const,
        gameState: {
            layout: '.../../../....',
            size: 8,
            turn: 0,
            players: ['B', 'R'],
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

        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: mockState,
            actions: mockActions,
        });
    });

    afterEach(() => {
        clearAuth();
    });

    const defaultConfig = {
        boardSize: 8,
        mode: 'BOT' as const,
        strategy: 'random',
        difficulty: 'easy'
    };

    const renderWithConfig = (stateConfig = defaultConfig) => {
        return renderWithProviders(
            <MemoryRouter initialEntries={[{ pathname: '/gamey', state: stateConfig }]}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>,
            { withRouter: false }
        );
    };

    it('renders the game title when config is provided', () => {
        renderWithConfig();
        expect(screen.getByText(/¡Tu partida de Y!/i)).toBeInTheDocument();
    });

    it('shows "No se encontró la configuración de la partida" when no config is provided', () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/gamey']}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>,
            { withRouter: false }
        );

        expect(screen.getByText(/No se encontró la configuración de la partida/i)).toBeInTheDocument();
        expect(screen.getByText(/Vuelve a la página de crear partida/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Crear partida/i })).toBeInTheDocument();
    });
});

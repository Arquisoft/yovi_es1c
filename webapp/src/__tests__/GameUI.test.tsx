import { render, screen } from '@testing-library/react';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as useGameControllerModule from '../features/game/hooks/useGameController';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: mockState,
            actions: mockActions,
        });
    });

    const renderWithConfig = (stateConfig = { boardSize: 8, mode: 'BOT', strategy: 'random', difficulty: 'easy' }) => {
        render(
            <MemoryRouter initialEntries={[{ pathname: '/gamey', state: stateConfig }]}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>
        );
    };

    it('renders the game title when config is provided', () => {
        renderWithConfig();
        expect(screen.getByText(/¡Tu partida de Y!/i)).toBeInTheDocument();
    });

    it('shows "No se encontró la configuración de la partida" when no config is provided', () => {
        render(
            <MemoryRouter initialEntries={['/gamey']}>
                <Routes>
                    <Route path="/gamey" element={<GameUI />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByText(/No se encontró la configuración de la partida/i)).toBeInTheDocument();
        expect(screen.getByText(/Vuelve a la página de crear partida/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Crear partida/i })).toBeInTheDocument();
    });
});
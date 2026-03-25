import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWithProviders, setupAuthenticatedUser, clearAuth, screen } from './test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import * as useGameControllerModule from '../features/game/hooks/useGameController';

vi.mock('../features/game/hooks/useGameController');
vi.mock('../features/game/hooks/useOnlineSession', () => ({ useOnlineSession: vi.fn() }));
vi.mock('../features/game/hooks/useChatSession', () => ({ useChatSession: vi.fn() }));
vi.mock('../features/game/ui/tsx/Board.tsx', () => ({
    Board: ({ onCellClick }: any) => <button onClick={() => onCellClick(0, 0)}>BoardMock</button>,
}));

import { useOnlineSession } from '../features/game/hooks/useOnlineSession';
import { useChatSession } from '../features/game/hooks/useChatSession';

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

    it('renders online session data and chat in ONLINE mode', () => {
        const playMove = vi.fn();
        const sendMessage = vi.fn();
        vi.mocked(useOnlineSession).mockReturnValue({
            sessionState: {
                matchId: 'online-1',
                layout: '. /..'.replace(/ /g, ''),
                size: 2,
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
});

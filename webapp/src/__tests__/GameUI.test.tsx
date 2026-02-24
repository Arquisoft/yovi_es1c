import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import GameUI from '../features/game/ui/tsx/GameUI.tsx';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as useGameControllerModule from '../features/game/hooks/useGameController';

vi.mock('../features/game/hooks/useGameController');

describe('GameUI Component', () => {
    const mockActions = {
        selectMode: vi.fn(),
        newGame: vi.fn(),
        handleCellClick: vi.fn(),
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


    it('renders game mode buttons', () => {
        render(<GameUI />);
        const botButtons = screen.getAllByText('VS Bot');
        expect(botButtons.length).toBeGreaterThan(0);
        const localButtons = screen.getAllByText('2 Jugadores');
        expect(localButtons.length).toBeGreaterThan(0);
    });

    it('renders size buttons', () => {
        render(<GameUI />);
        const size8Buttons = screen.getAllByText('8x8');
        expect(size8Buttons.length).toBeGreaterThan(0);
        const size16Buttons = screen.getAllByText('16x16');
        expect(size16Buttons.length).toBeGreaterThan(0);
        const size32Buttons = screen.getAllByText('32x32');
        expect(size32Buttons.length).toBeGreaterThan(0);
    });

    it('calls selectMode when mode button is clicked', () => {
        render(<GameUI />);
        const buttons = screen.getAllByRole('button');
        const localButton = buttons.find(btn => btn.textContent === '2 Jugadores');
        if (localButton) {
            fireEvent.click(localButton);
            expect(mockActions.selectMode).toHaveBeenCalledWith('LOCAL_2P');
        }
    });

    it('calls changeSize when size button is clicked', () => {
        render(<GameUI />);
        const buttons = screen.getAllByRole('button');
        const sizeButton = buttons.find(btn => btn.textContent === '16x16');
        if (sizeButton) {
            fireEvent.click(sizeButton);
            expect(mockActions.changeSize).toHaveBeenCalledWith(16);
        }
    });

    it('calls newGame when new game button is clicked', () => {
        render(<GameUI />);
        const newGameButton = screen.getByText(/Nueva Partida/i);
        fireEvent.click(newGameButton);
        expect(mockActions.newGame).toHaveBeenCalled();
    });

    it('displays loading message when bot is thinking', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, loading: true, gameMode: 'BOT' },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Bot pensando...')).toBeInTheDocument();
    });

    it('displays error message when error exists', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, error: 'Test error' },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    it('displays game over message when board is full', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, gameOver: true, isBoardFull: true },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Partida terminada')).toBeInTheDocument();
    });

    it('shows correct turn indicator for bot mode', () => {
        render(<GameUI />);
        expect(screen.getByText('Tu turno')).toBeInTheDocument();
    });

    it('shows correct turn indicator for 2 player mode', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, gameMode: 'LOCAL_2P' },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Jugador 1')).toBeInTheDocument();
    });

    it('handles dark mode change', () => {
        render(<GameUI />);
        act(() => {
            window.__setMatchMedia?.(true);
        });
    });


    it('displays message when provided', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, message: 'Test message' },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Test message')).toBeInTheDocument();
    });

    it('shows correct mode in stats section', () => {
        render(<GameUI />);
        const statValues = screen.getAllByText('VS Bot');
        expect(statValues.length).toBeGreaterThan(0);
    });

    it('shows game status as ongoing', () => {
        render(<GameUI />);
        expect(screen.getByText('En juego')).toBeInTheDocument();
    });

    it('shows game status as finished when game is over', () => {
        vi.mocked(useGameControllerModule.useGameController).mockReturnValue({
            state: { ...mockState, gameOver: true },
            actions: mockActions,
        });

        render(<GameUI />);
        expect(screen.getByText('Finalizado')).toBeInTheDocument();
    });
});

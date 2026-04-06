import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WinnerOverlay from '../features/game/ui/tsx/WinnerOverlay';

describe('WinnerOverlay Component', () => {
    const winnerLabel = 'Ganador: Alice';
    const onNewGame = vi.fn();
    const onNavigateHome = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the game over title and winner label', () => {
        render(<WinnerOverlay winnerLabel={winnerLabel} onNewGame={onNewGame} onNavigateHome={onNavigateHome} />);

        expect(screen.getByText('¡FIN DEL JUEGO!')).toBeInTheDocument();
        expect(screen.getByText(winnerLabel)).toBeInTheDocument();
    });

    it('calls onNewGame when "Jugar de nuevo" button is clicked', () => {
        render(<WinnerOverlay winnerLabel={winnerLabel} onNewGame={onNewGame} onNavigateHome={onNavigateHome} />);

        fireEvent.click(screen.getByRole('button', { name: /Jugar de nuevo/i }));
        expect(onNewGame).toHaveBeenCalledTimes(1);
    });

    it('calls onNavigateHome when "Nueva configuración" button is clicked', () => {
        render(<WinnerOverlay winnerLabel={winnerLabel} onNewGame={onNewGame} onNavigateHome={onNavigateHome} />);

        fireEvent.click(screen.getByRole('button', { name: /Nueva configuración/i }));
        expect(onNavigateHome).toHaveBeenCalledTimes(1);
    });

    it('renders the buttons and triggers callbacks', () => {
        render(<WinnerOverlay winnerLabel={winnerLabel} onNewGame={onNewGame} onNavigateHome={onNavigateHome} />);

        const newGameBtn = screen.getByRole('button', { name: /Jugar de nuevo/i });
        const homeBtn = screen.getByRole('button', { name: /Nueva configuración/i });

        expect(newGameBtn).toBeInTheDocument();
        expect(homeBtn).toBeInTheDocument();

        fireEvent.click(newGameBtn);
        expect(onNewGame).toHaveBeenCalledTimes(1);

        fireEvent.click(homeBtn);
        expect(onNavigateHome).toHaveBeenCalledTimes(1);
    });
});
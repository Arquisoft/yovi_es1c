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
describe('WinnerOverlay – online / rematch states', () => {
    const winnerLabel = 'Ganador: Alice';
    const onNewGame = vi.fn();
    const onNavigateHome = vi.fn();

    beforeEach(() => vi.clearAllMocks());

    it('does NOT show "Jugar de nuevo" button in online mode', () => {
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="idle"
            />,
        );
        expect(screen.queryByRole('button', { name: /Jugar de nuevo/i })).not.toBeInTheDocument();
    });

    it('shows "Solicitar revancha" button when idle and calls onRequestRematch', () => {
        const onRequestRematch = vi.fn();
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="idle"
                onRequestRematch={onRequestRematch}
            />,
        );
        const btn = screen.getByRole('button', { name: /Solicitar revancha/i });
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onRequestRematch).toHaveBeenCalledTimes(1);
    });

    it('shows waiting spinner when rematchState is pending and hides request button', () => {
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="pending"
            />,
        );
        expect(screen.getByText(/Esperando respuesta/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Solicitar revancha/i })).not.toBeInTheDocument();
    });

    it('shows requester name and accept/decline buttons when incoming', () => {
        const onAcceptRematch = vi.fn();
        const onDeclineRematch = vi.fn();
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="incoming"
                rematchRequesterName="Bob"
                onAcceptRematch={onAcceptRematch}
                onDeclineRematch={onDeclineRematch}
            />,
        );
        expect(screen.getByText(/Bob/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }));
        expect(onAcceptRematch).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: /Rechazar/i }));
        expect(onDeclineRematch).toHaveBeenCalledTimes(1);
    });

    it('falls back to generic rival name when requesterName is not provided', () => {
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="incoming"
            />,
        );
        expect(screen.getByText(/Tu rival/i)).toBeInTheDocument();
    });

    it('still shows "Nueva configuración" button in online mode', () => {
        render(
            <WinnerOverlay
                winnerLabel={winnerLabel}
                onNewGame={onNewGame}
                onNavigateHome={onNavigateHome}
                isOnline
                rematchState="idle"
                onNavigateHome={onNavigateHome}
            />,
        );
        const btn = screen.getByRole('button', { name: /Nueva configuración/i });
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        expect(onNavigateHome).toHaveBeenCalledTimes(1);
    });
});
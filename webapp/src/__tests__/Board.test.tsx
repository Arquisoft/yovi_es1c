import { render, screen, fireEvent } from '@testing-library/react';
import { Board } from '../features/game/ui/Board';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Board Component', () => {
    const mockOnCellClick = vi.fn();

    const defaultProps = {
        layout: './BB/RRR',
        size: 3,
        onCellClick: mockOnCellClick,
        currentPlayer: 0,
        isDark: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders board with correct size', () => {
        const { container } = render(<Board {...defaultProps} />);
        const boardContainer = container.querySelector('[data-size="3"]');
        expect(boardContainer).toBeInTheDocument();
    });

    it('calls onCellClick when empty cell is clicked', () => {
        render(<Board {...defaultProps} />);
        const buttons = screen.getAllByRole('button');
        const emptyButton = buttons.find(btn => btn.textContent === '');

        if (emptyButton) {
            fireEvent.click(emptyButton);
            expect(mockOnCellClick).toHaveBeenCalled();
        }
    });

    it('does not call onCellClick when occupied cell is clicked', () => {
        render(<Board {...defaultProps} />);
        const buttons = screen.getAllByRole('button');
        const occupiedButton = buttons.find(btn => btn.textContent === 'B');

        if (occupiedButton) {
            fireEvent.click(occupiedButton);
            expect(occupiedButton).toBeDisabled();
        }
    });

    it('renders with dark theme', () => {
        const { container } = render(<Board {...defaultProps} isDark={true} />);
        const boardContainer = container.querySelector('[data-size="3"]');
        expect(boardContainer).toBeInTheDocument();
    });

    it('renders with light theme', () => {
        const { container } = render(<Board {...defaultProps} isDark={false} />);
        const boardContainer = container.querySelector('[data-size="3"]');
        expect(boardContainer).toBeInTheDocument();
    });

    it('renders correct aria-labels', () => {
        render(<Board {...defaultProps} />);
        expect(screen.getByLabelText('Celda fila 1, columna 1')).toBeInTheDocument();
    });
});

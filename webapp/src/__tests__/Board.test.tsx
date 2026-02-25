import { render, screen, fireEvent } from '@testing-library/react';
import { Board } from '../features/game/ui/tsx/Board.tsx';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Board Component', () => {
    const mockOnCellClick = vi.fn();

    const defaultProps = {
        layout: 'B../R..',
        size: 3,
        onCellClick: mockOnCellClick,
        currentPlayer: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correct number of rows and cells', () => {
        const { container } = render(<Board {...defaultProps} />);
        const rows = container.querySelectorAll('.row');
        expect(rows.length).toBe(defaultProps.size);

        const totalCells = container.querySelectorAll('.cell');
        expect(totalCells.length).toBe((defaultProps.size * (defaultProps.size + 1)) / 2);
    });

    it('calls onCellClick when empty cell is clicked', () => {
        render(<Board {...defaultProps} />);
        const buttons = screen.getAllByRole('button');

        const emptyButton = Array.from(buttons).find(btn =>
            btn.className.includes('empty')
        );

        expect(emptyButton).toBeDefined();

        if (emptyButton) {
            fireEvent.click(emptyButton);
            expect(mockOnCellClick).toHaveBeenCalled();
        }
    });

    it('does not call onCellClick when occupied cell is clicked', () => {
        render(<Board {...defaultProps} />);
        const buttons = screen.getAllByRole('button');

        const occupiedButton = Array.from(buttons).find(btn =>
            btn.className.includes('occupied')
        );

        expect(occupiedButton).toBeDefined();

        if (occupiedButton) {
            fireEvent.click(occupiedButton);
            expect(mockOnCellClick).not.toHaveBeenCalled();
            expect(occupiedButton).toBeDisabled();
        }
    });

    it('renders correctly for triangular board', () => {
        const { container } = render(<Board {...defaultProps} />);
        const totalCells = container.querySelectorAll('.cell');
        expect(totalCells.length).toBe(6);
    });
});
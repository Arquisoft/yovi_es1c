import { describe, it, expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { HelpButton } from '../components/HelpButton';

describe('HelpButton', () => {
    const renderComponent = () =>
        renderWithProviders(
            <HelpButton
                titleKey="help.createMatch.title"
                contentKeys={[
                    'help.createMatch.boardSize',
                    'help.createMatch.mode',
                ]}
            />,
            { withRouter: false },
        );

    const openDialog = async () => {
        fireEvent.click(screen.getByRole('button', { name: /abrir ayuda contextual/i }));
        await screen.findByText('Cómo configurar la partida');
    };

    it('renders the help button', () => {
        renderComponent();
        expect(screen.getByRole('button', { name: /abrir ayuda contextual/i })).toBeInTheDocument();
    });

    it('opens dialog with translated content', async () => {
        renderComponent();
        await openDialog();

        expect(screen.getByText(/Elige el tamaño del tablero/i)).toBeInTheDocument();
    });

    it('closes dialog via close button', async () => {
        renderComponent();
        await openDialog();

        fireEvent.click(await screen.findByRole('button', { name: /cerrar ayuda/i }));

        await waitFor(() => {
            expect(screen.queryByText('Cómo configurar la partida')).not.toBeInTheDocument();
        });
    });

    it('closes dialog using Escape key', async () => {
        renderComponent();
        await openDialog();

        const dialogContainer = document.querySelector('.MuiDialog-container');
        expect(dialogContainer).toBeTruthy();
        if (dialogContainer) {
            fireEvent.keyDown(dialogContainer, { key: 'Escape' });
        }

        await waitFor(() => {
            expect(screen.queryByText('Cómo configurar la partida')).not.toBeInTheDocument();
        });
    });

    it('closes dialog when clicking backdrop and keeps accessibility attributes', async () => {
        renderComponent();
        await openDialog();

        const dialogPaper = document.querySelector('.MuiDialog-paper');
        expect(dialogPaper).toHaveAttribute('role', 'dialog');
        expect(dialogPaper).toHaveAttribute('aria-modal', 'true');
        expect(dialogPaper).toHaveAttribute('aria-labelledby');

        const backdrop = document.querySelector('.MuiBackdrop-root');
        expect(backdrop).toBeTruthy();
        if (backdrop) {
            fireEvent.click(backdrop);
        }

        await waitFor(() => {
            expect(screen.queryByText('Cómo configurar la partida')).not.toBeInTheDocument();
        });
    });
});
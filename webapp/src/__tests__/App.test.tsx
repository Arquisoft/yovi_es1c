import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';

vi.mock('../components/layout/Nav', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

    return {
        default: () => (
            <nav>
                <actual.Link to="/">Home</actual.Link>
                <actual.Link to="/gamey">Play</actual.Link>
                <actual.Link to="/stats">Stats</actual.Link>
            </nav>
        ),
    };
});

vi.mock('../features/auth/ui/LoginForm.tsx', () => ({
    default: () => <div>LoginForm Mock</div>,
}));

vi.mock('../features/auth/ui/RegisterForm.tsx', () => ({
    default: () => <div>RegisterForm Mock</div>,
}));

vi.mock('../features/game/ui/GameUI.tsx', () => ({
    default: () => <div>GameUI Mock</div>,
}));

import App from '../app/App';

describe('App', () => {
    it('redirects to /login when not authenticated', () => {
        localStorage.clear();
        render(<App />);

        expect(screen.getByText('LoginForm Mock')).toBeInTheDocument();
    });

    it('navigates to /gamey', async () => {
        render(<App />);

        act(() => {
            fireEvent.click(screen.getByRole('link', { name: 'Play' }));
        });

        await waitFor(() => {
            expect(screen.getByText('GameUI Mock')).toBeInTheDocument();
        });
    });

    it('navigates to /stats', async () => {
        render(<App />);

        act(() => {
            fireEvent.click(screen.getByRole('link', { name: 'Stats' }));
        });

        await waitFor(() => {
            expect(screen.getByText('Estadísticas')).toBeInTheDocument();
        });
        expect(screen.getByText(/Aquí irán las estadísticas/i)).toBeInTheDocument();
    });
});

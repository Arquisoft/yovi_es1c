import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../app/App';

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

vi.mock('../features/auth/ui/RegisterForm.tsx', () => ({
    default: () => <div>RegisterForm Mock</div>,
}));

vi.mock('../features/game/ui/tsx/GameUI.tsx', () => ({
    default: () => <div>GameUI Mock</div>,
}));

describe('App Routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders home route content by default', () => {
        render(<App />);
        expect(screen.getByText(/Welcome to the Software Arquitecture 2025-2026 course/i)).toBeInTheDocument();
        expect(screen.getByText('RegisterForm Mock')).toBeInTheDocument();
    });

    it('navigates to /gamey when clicking Play', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Play' }));

        await waitFor(() => {
            expect(screen.getByText('GameUI Mock')).toBeInTheDocument();
        });
    });

    it('navigates to /stats when clicking Stats', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Stats' }));

        await waitFor(() => {
            expect(screen.getByText('Estadísticas')).toBeInTheDocument();
            expect(screen.getByText(/Aquí irán las estadísticas del juego/i)).toBeInTheDocument();
        });
    });

    it('navigates back to Home when clicking Home', async () => {
        render(<App />);
        fireEvent.click(screen.getByRole('link', { name: 'Play' }));
        await waitFor(() => screen.getByText('GameUI Mock'));

        fireEvent.click(screen.getByRole('link', { name: 'Home' }));
        await waitFor(() => {
            expect(screen.getByText(/Welcome to the Software Arquitecture 2025-2026 course/i)).toBeInTheDocument();
            expect(screen.getByText('RegisterForm Mock')).toBeInTheDocument();
        });
    });
});
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import Nav from '../components/layout/Nav';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { describe, it, expect } from 'vitest';

function renderNav() {
    return render(
        <MemoryRouter>
            <AuthProvider>
                <Nav />
            </AuthProvider>
        </MemoryRouter>
    );
}

describe('Nav Component', () => {
    it('renders navigation links', () => {
        renderNav();

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Play')).toBeInTheDocument();
        expect(screen.getByText('Stats')).toBeInTheDocument();
    });

    it('shows login and register links when not authenticated', () => {
        renderNav();

        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('Register')).toBeInTheDocument();
    });

    it('handles dark mode detection at mount', () => {
        act(() => {
            window.__setMatchMedia?.(true);
        });

        renderNav();

        expect(screen.getByAltText('Game Y Logo')).toBeInTheDocument();
    });

    it('handles media query change events', () => {
        renderNav();

        act(() => {
            window.__setMatchMedia?.(true);
            window.__setMatchMedia?.(false);
        });
    });

    it('handles scroll events to show/hide nav', () => {
        renderNav();

        Object.defineProperty(window, 'scrollY', { writable: true, value: 100 });
        fireEvent.scroll(window);

        Object.defineProperty(window, 'scrollY', { writable: true, value: 50 });
        fireEvent.scroll(window);

        Object.defineProperty(window, 'scrollY', { writable: true, value: 0 });
        fireEvent.scroll(window);
    });
});

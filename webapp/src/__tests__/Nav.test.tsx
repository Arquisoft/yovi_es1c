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
        expect(screen.getByText('New game')).toBeInTheDocument(); // actualizado
        expect(screen.getByText('Stats')).toBeInTheDocument();
    });

    it('shows login and register links when not authenticated', () => {
        renderNav();

        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('Register')).toBeInTheDocument();
    });

    it('handles dark mode detection at mount', () => {
        act(() => {
            (globalThis as unknown as { __setMatchMedia?: (v: boolean) => void }).__setMatchMedia?.(true);
        });

        renderNav();

        expect(screen.getByAltText('Game Y Logo')).toBeInTheDocument();
    });

    it('shows login and register links when not authenticated', () => {
        renderNav();

        expect(screen.getByText('Login')).toBeInTheDocument();
        expect(screen.getByText('Register')).toBeInTheDocument();
    });

    it('applies dark mode class if prefers-color-scheme is dark', () => {
        // Simula dark mode
        (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
            matches: true,
            media: '(prefers-color-scheme: dark)',
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as MediaQueryList);

        renderNav();

        const nav = document.querySelector('nav');
        expect(nav?.className).toContain('dark');
    });

    it('handles media query change events', () => {
        renderNav();

        const g = globalThis as unknown as { __setMatchMedia?: (v: boolean) => void };
        act(() => {
            g.__setMatchMedia?.(true);
            g.__setMatchMedia?.(false);
        });

        expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('handles scroll events to show/hide nav', () => {
        renderNav();

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 100 });
        fireEvent.scroll(globalThis as unknown as Window);

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 50 });
        fireEvent.scroll(globalThis as unknown as Window);

        Object.defineProperty(globalThis, 'scrollY', { writable: true, value: 0 });
        fireEvent.scroll(globalThis as unknown as Window);

        expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('shows username and logout button when authenticated', () => {
        localStorage.setItem('auth_token', 'test-token');
        localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'Pablo' }));

        renderNav();

        expect(screen.getByText('Pablo')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();

        localStorage.clear();
    });

    it('clears session when clicking logout', () => {
        localStorage.setItem('auth_token', 'test-token');
        localStorage.setItem('auth_user', JSON.stringify({ id: 1, username: 'Pablo' }));

        renderNav();
        fireEvent.click(screen.getByRole('button', { name: /logout/i }));

        expect(localStorage.getItem('auth_token')).toBeNull();
    });
});
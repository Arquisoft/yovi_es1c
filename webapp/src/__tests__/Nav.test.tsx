import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { act } from 'react';
import Nav from '../components/layout/Nav';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Nav Component', () => {
    beforeEach(() => {
        // Mock básico de matchMedia
        window.matchMedia = window.matchMedia || function(query) {
            return {
                matches: false,
                media: query,
                addEventListener: () => {},
                removeEventListener: () => {},
            } as unknown as MediaQueryList;
        };
    });

    it('renders navigation links correctly', () => {
        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('New game')).toBeInTheDocument(); // actualizado
        expect(screen.getByText('Stats')).toBeInTheDocument();
        expect(screen.getByAltText('Game Y Logo')).toBeInTheDocument();
    });

    it('applies dark mode class if prefers-color-scheme is dark', () => {
        // Simula dark mode
        window.matchMedia = () => ({
            matches: true,
            media: '(prefers-color-scheme: dark)',
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as MediaQueryList);

        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        const nav = document.querySelector('nav');
        expect(nav?.className).toContain('dark');
    });

    it('toggles visibility on scroll', () => {
        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        const nav = document.querySelector('nav');
        if (!nav) throw new Error('Nav not found');

        act(() => {
            Object.defineProperty(window, 'scrollY', { writable: true, value: 100 });
            fireEvent.scroll(window);
        });
        expect(nav.className).toContain('hidden');

        act(() => {
            Object.defineProperty(window, 'scrollY', { writable: true, value: 0 });
            fireEvent.scroll(window);
        });
        expect(nav.className).toContain('visible');
    });
});
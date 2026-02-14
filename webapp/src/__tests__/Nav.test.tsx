import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { act } from 'react';
import Nav from '../components/layout/Nav';
import { describe, it, expect } from 'vitest';

describe('Nav Component', () => {
    it('renders navigation links', () => {
        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Play')).toBeInTheDocument();
        expect(screen.getByText('Stats')).toBeInTheDocument();
    });

    it('handles dark mode detection at mount', () => {
        act(() => {
            window.__setMatchMedia?.(true);
        });

        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        expect(screen.getByAltText('Game Y Logo')).toBeInTheDocument();
    });

    it('handles media query change events', () => {
        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        act(() => {
            window.__setMatchMedia?.(true);
            window.__setMatchMedia?.(false);
        });
    });

    it('handles scroll events to show/hide nav', () => {
        render(
            <BrowserRouter>
                <Nav />
            </BrowserRouter>
        );

        Object.defineProperty(window, 'scrollY', { writable: true, value: 100 });
        fireEvent.scroll(window);

        Object.defineProperty(window, 'scrollY', { writable: true, value: 50 });
        fireEvent.scroll(window);

        Object.defineProperty(window, 'scrollY', { writable: true, value: 0 });
        fireEvent.scroll(window);
    });
});

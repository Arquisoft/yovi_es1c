import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

declare global {
    interface Window {
        __setMatchMedia?: (nextMatches: boolean) => void;
    }
}

(function setupMatchMediaMock() {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mqlBase = {
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
            if (event === 'change') listeners.add(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
            if (event === 'change') listeners.delete(cb);
        }),
        dispatchEvent: vi.fn(),
    };

    const mql = mqlBase as unknown as MediaQueryList;

    // Define matches writable (sin any)
    Object.defineProperty(mql, 'matches', {
        value: false,
        writable: true,
        configurable: true,
    });

    const matchMedia = vi.fn().mockImplementation(() => mql);

    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: matchMedia,
    });

    window.__setMatchMedia = (nextMatches: boolean) => {
        Object.defineProperty(mql, 'matches', {
            value: nextMatches,
            writable: true,
            configurable: true,
        });

        const evt = { matches: nextMatches } as MediaQueryListEvent;
        listeners.forEach((fn) => fn(evt));
    };
})();

afterEach(() => {
    cleanup();
    window.__setMatchMedia?.(false);
});

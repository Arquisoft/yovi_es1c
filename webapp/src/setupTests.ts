import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import esCommon from './i18n/locales/es/common.json';
import { beforeAll } from 'vitest';

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

const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: (key: string): string | null => store[key] || null,
        setItem: (key: string, value: string): void => {
            if (value !== undefined && value !== null) {
                store[key] = String(value);
            }
        },
        removeItem: (key: string): void => {
            delete store[key];
        },
        clear: (): void => {
            store = {};
        },
        get length(): number {
            return Object.keys(store).length;
        },
        key: (index: number): string | null => {
            const keys = Object.keys(store);
            return keys[index] || null;
        },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});


Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
})

beforeAll(async () => {
    await i18n
        .use(initReactI18next)
        .init({
            lng: 'es',
            fallbackLng: 'es',

            ns: ['common'],
            defaultNS: 'common',

            resources: {
                es: {
                    common: esCommon,
                },
            },

            interpolation: {
                escapeValue: false,
            },
        });
});
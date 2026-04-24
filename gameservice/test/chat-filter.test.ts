import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFilter, ChatFilterError } from '../src/services/ChatFilter';

describe('ChatFilter', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.useRealTimers();
        delete process.env.PERSPECTIVE_API_KEY;
        delete process.env.PERSPECTIVE_TIMEOUT_MS;
        delete process.env.PERSPECTIVE_FAIL_MODE;
    });

    function setup(options = {}) {
        return new ChatFilter(options);
    }

    function mockFetchToxicity(value: number, ok = true) {
        const fetchMock = vi.fn().mockResolvedValue({
            ok,
            json: async () => ({
                attributeScores: {
                    TOXICITY: {
                        summaryScore: { value },
                    },
                },
            }),
            text: async () => 'error',
            status: ok ? 200 : 500,
        });

        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('filters leetspeak and normalized bad words', () => {
        const filter = setup();

        const result = filter.filterSync('p.u.t.a y j0d3r');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
    });

    it('filters accented and repeated characters', () => {
        const filter = setup();

        const result = filter.filterSync('puuuuta y p\u00fct\u00e4');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
    });

    it('filters contextual insults like "eres idiota"', () => {
        const filter = setup();

        const result = filter.filterSync('eres un idiota');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
    });

    it('does not flag neutral usage like "me siento mal"', () => {
        const filter = setup();

        const result = filter.filterSync('me siento mal');

        expect(result.wasFiltered).toBe(false);
    });

    it('returns clean text when no bad words exist', () => {
        const filter = setup();

        const result = filter.filterSync('hola mundo esto es limpio');

        expect(result.wasFiltered).toBe(false);
        expect(result.sanitized).toBe('hola mundo esto es limpio');
    });

    it('async filter returns toxicityScore when API key exists', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        const fetchMock = mockFetchToxicity(0.42);

        const filter = setup({ toxicityThreshold: 0.8 });
        const result = await filter.filter('hola mundo');

        expect(fetchMock).toHaveBeenCalled();
        expect(result.toxicityScore).toBe(0.42);
        expect(result.sanitized).toBe('hola mundo');
    });

    it('does not call Perspective API if no API key is set', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const filter = setup();
        const result = await filter.filter('texto normal');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.toxicityScore).toBeUndefined();
    });

    it('throws ChatFilterError when toxicity exceeds threshold', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        mockFetchToxicity(0.95);

        const filter = setup({ toxicityThreshold: 0.8 });

        await expect(filter.filter('algo')).rejects.toMatchObject({
            kind: 'toxicity',
            score: 0.95,
        });
    });

    it('uses custom toxicity threshold correctly', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        mockFetchToxicity(0.75);

        const filter = setup({ toxicityThreshold: 0.7 });

        await expect(filter.filter('texto')).rejects.toMatchObject({
            kind: 'toxicity',
            score: 0.75,
        });
    });

    it('falls back to static moderation when Perspective fails in allow mode', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const filter = setup({ perspectiveFailureMode: 'allow' });
        const result = await filter.filter('eres un idiota');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
        expect(result.toxicityScore).toBeUndefined();
    });

    it('rejects the message when Perspective fails in reject mode', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        const filter = setup({ perspectiveFailureMode: 'reject' });

        await expect(filter.filter('texto')).rejects.toMatchObject({
            kind: 'service_unavailable',
            score: undefined,
        });
    });

    it('aborts Perspective requests after the configured timeout', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        vi.useFakeTimers();

        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () => {
                const abortError = new Error('Aborted');
                abortError.name = 'AbortError';
                reject(abortError);
            }, { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const filter = setup({ perspectiveFailureMode: 'reject', perspectiveTimeoutMs: 5 });
        const assertion = expect(filter.filter('texto')).rejects.toMatchObject({
            kind: 'service_unavailable',
            score: undefined,
        });

        await vi.advanceTimersByTimeAsync(5);

        await assertion;
        expect(fetchMock).toHaveBeenCalled();
    });

    it('keeps sanitization and toxicity evaluation together', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';
        mockFetchToxicity(0.2);

        const filter = setup();
        const result = await filter.filter('eres un idiota');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
        expect(result.toxicityScore).toBe(0.2);
    });
});

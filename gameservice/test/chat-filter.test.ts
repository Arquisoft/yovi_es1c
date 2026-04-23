import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFilter, ChatFilterError } from '../src/services/ChatFilter';

describe('ChatFilter', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
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

        const result = filter.filterSync('puuuuta y pütä');

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
        delete process.env.PERSPECTIVE_API_KEY;

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

        await expect(filter.filter('algo')).rejects.toBeInstanceOf(ChatFilterError);
    });

    it('uses custom toxicity threshold correctly', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';

        mockFetchToxicity(0.75);

        const filter = setup({ toxicityThreshold: 0.7 });

        await expect(filter.filter('texto')).rejects.toBeInstanceOf(ChatFilterError);
    });

    it('handles Perspective API failure gracefully', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => 'error',
        }));

        const filter = setup();

        const result = await filter.filter('texto');

        expect(result.toxicityScore).toBe(0);
    });

    it('sanitization and toxicity work together', async () => {
        process.env.PERSPECTIVE_API_KEY = 'test-key';

        mockFetchToxicity(0.2);

        const filter = setup();

        const result = await filter.filter('eres un idiota');

        expect(result.wasFiltered).toBe(true);
        expect(result.sanitized).toContain('*');
        expect(result.toxicityScore).toBe(0.2);
    });
});
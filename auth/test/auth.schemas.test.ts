import { describe, it, expect } from 'vitest';
import { parseAuthBody, parseRefreshBody, parseLogoutBody } from '../src/validation/auth.schemas.js';
import { InvalidInputError } from '../src/errors/domain-errors.js';


describe('parseAuthBody', () => {
    it('returns parsed body with valid username and password', () => {
        const result = parseAuthBody({ username: 'alice', password: 'secret123' });
        expect(result.username).toBe('alice');
        expect(result.password).toBe('secret123');
    });

    it('trims username whitespace', () => {
        const result = parseAuthBody({ username: '  alice  ', password: 'secret123' });
        expect(result.username).toBe('alice');
    });

    it('includes deviceId and deviceName when provided', () => {
        const result = parseAuthBody({ username: 'alice', password: 'secret123', deviceId: 'dev-1', deviceName: 'Mi PC' });
        expect(result.deviceId).toBe('dev-1');
        expect(result.deviceName).toBe('Mi PC');
    });

    it('omits deviceId when blank', () => {
        const result = parseAuthBody({ username: 'alice', password: 'secret123', deviceId: '   ' });
        expect(result.deviceId).toBeUndefined();
    });

    it('omits deviceName when blank', () => {
        const result = parseAuthBody({ username: 'alice', password: 'secret123', deviceName: '' });
        expect(result.deviceName).toBeUndefined();
    });

    it('throws InvalidInputError when username is missing', () => {
        expect(() => parseAuthBody({ password: 'secret123' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when username is empty string', () => {
        expect(() => parseAuthBody({ username: '  ', password: 'secret123' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when password is missing', () => {
        expect(() => parseAuthBody({ username: 'alice' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when password is shorter than 8 chars', () => {
        expect(() => parseAuthBody({ username: 'alice', password: 'short' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when password is empty', () => {
        expect(() => parseAuthBody({ username: 'alice', password: '' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when body is not an object', () => {
        expect(() => parseAuthBody('string')).toThrow(InvalidInputError);
        expect(() => parseAuthBody(null)).toThrow(InvalidInputError);
        expect(() => parseAuthBody([1, 2])).toThrow(InvalidInputError);
    });

    it('throws with both field errors when both username and password are missing', () => {
        try {
            parseAuthBody({});
            expect.fail('Should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(InvalidInputError);
            const details = (e as { details?: Array<{ field: string }> }).details ?? [];
            const fields = details.map(d => d.field);
            expect(fields).toContain('username');
            expect(fields).toContain('password');
        }
    });
});

// ── parseRefreshBody ──────────────────────────────────────────────────────────

describe('parseRefreshBody', () => {
    it('returns refreshToken when valid', () => {
        const result = parseRefreshBody({ refreshToken: 'tok123' });
        expect(result.refreshToken).toBe('tok123');
    });

    it('trims refreshToken', () => {
        const result = parseRefreshBody({ refreshToken: '  tok  ' });
        expect(result.refreshToken).toBe('tok');
    });

    it('returns empty object when refreshToken is not provided', () => {
        const result = parseRefreshBody({});
        expect(result.refreshToken).toBeUndefined();
    });

    it('throws InvalidInputError when refreshToken is empty string', () => {
        expect(() => parseRefreshBody({ refreshToken: '   ' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when refreshToken is not a string', () => {
        expect(() => parseRefreshBody({ refreshToken: 123 })).toThrow(InvalidInputError);
    });

    it('throws when body is not an object', () => {
        expect(() => parseRefreshBody('bad')).toThrow(InvalidInputError);
    });
});

// ── parseLogoutBody ───────────────────────────────────────────────────────────

describe('parseLogoutBody', () => {
    it('returns sessionId when valid', () => {
        const result = parseLogoutBody({ sessionId: 'sess-abc' });
        expect(result.sessionId).toBe('sess-abc');
    });

    it('trims sessionId', () => {
        const result = parseLogoutBody({ sessionId: '  sess  ' });
        expect(result.sessionId).toBe('sess');
    });

    it('returns empty object when sessionId not provided', () => {
        const result = parseLogoutBody({});
        expect(result.sessionId).toBeUndefined();
    });

    it('returns empty object when body is null', () => {
        const result = parseLogoutBody(null);
        expect(result).toEqual({});
    });

    it('returns empty object when body is undefined', () => {
        const result = parseLogoutBody(undefined);
        expect(result).toEqual({});
    });

    it('throws InvalidInputError when sessionId is empty string', () => {
        expect(() => parseLogoutBody({ sessionId: '' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when sessionId is whitespace', () => {
        expect(() => parseLogoutBody({ sessionId: '   ' })).toThrow(InvalidInputError);
    });

    it('throws InvalidInputError when sessionId is not a string', () => {
        expect(() => parseLogoutBody({ sessionId: 42 })).toThrow(InvalidInputError);
    });

    it('throws when body is an array', () => {
        expect(() => parseLogoutBody([1, 2])).toThrow(InvalidInputError);
    });
});
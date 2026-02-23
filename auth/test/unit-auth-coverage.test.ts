import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../src/middleware/error-handler.js';
import { HttpError } from '../src/errors/http-error.js';
import { parseAuthBody, parseRefreshBody } from '../src/validation/auth.schemas.js';
import {
    BadCredentialsError,
    InvalidInputError,
    InvalidRefreshTokenError,
    UnexpectedError,
    UserAlreadyExistsError,
} from '../src/errors/domain-errors.js';
import { AuthService } from '../src/services/auth.service.js';

function buildRepoMock() {
    return {
        createUser: vi.fn(),
        findUserByUsername: vi.fn(),
        storeRefreshToken: vi.fn(),
        findRefreshTokenByHash: vi.fn(),
        revokeRefreshToken: vi.fn(),
        revokeRefreshTokenFamily: vi.fn(),
    };
}

describe('auth unit coverage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('covers validation branches and domain error constructors', () => {
        expect(() => parseAuthBody(null)).toThrow(InvalidInputError);
        expect(() => parseAuthBody({ username: 'alice', password: '' })).toThrow(InvalidInputError);
        expect(() => parseAuthBody({ username: 'alice', password: 'short' })).toThrow(InvalidInputError);
        expect(parseAuthBody({ username: ' alice ', password: 'password123' })).toEqual({
            username: 'alice',
            password: 'password123',
        });

        expect(() => parseRefreshBody({ refreshToken: '' })).toThrow(InvalidInputError);
        expect(parseRefreshBody({ refreshToken: ' token ' })).toEqual({ refreshToken: 'token' });
        expect(parseRefreshBody({})).toEqual({});

        expect(new UserAlreadyExistsError().statusCode).toBe(409);
        expect(new BadCredentialsError().statusCode).toBe(401);
        expect(new InvalidRefreshTokenError().statusCode).toBe(401);
        expect(new UnexpectedError().statusCode).toBe(500);
    });

    it('covers error handler unknown branch', () => {
        const status = vi.fn(() => ({ json: vi.fn() }));
        const res = { status } as any;
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        errorHandler(new Error('boom'), {} as any, res, vi.fn());

        expect(status).toHaveBeenCalledWith(500);
        expect(consoleSpy).toHaveBeenCalledTimes(1);

        const custom = new HttpError(418, 'teapot', 'teapot');
        const status2 = vi.fn(() => ({ json: vi.fn() }));
        errorHandler(custom, {} as any, { status: status2 } as any, vi.fn());
        expect(status2).toHaveBeenCalledWith(418);
    });

    it('covers register unexpected error and refresh without token', async () => {
        process.env.JWT_SECRET = 'unit-secret';
        const repo = buildRepoMock();
        repo.createUser.mockRejectedValue({ code: 'SOMETHING_ELSE' });

        const service = new AuthService(repo as any);
        await expect(service.register('alice', 'password123')).rejects.toBeInstanceOf(UnexpectedError);
        await expect(service.refresh()).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('covers signAccessToken catch branch', async () => {
        process.env.JWT_SECRET = 'unit-secret';
        const repo = buildRepoMock();
        repo.createUser.mockResolvedValue(1);

        const signSpy = vi.spyOn(jwt, 'sign').mockImplementation(() => {
            throw new Error('jwt-fail');
        });

        const service = new AuthService(repo as any);
        await expect(service.register('alice', 'password123')).rejects.toBeInstanceOf(UnexpectedError);
        expect(signSpy).toHaveBeenCalled();
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/services/auth.service.js';
import {
    BadCredentialsError,
    InvalidRefreshTokenError,
    UserAlreadyExistsError,
} from '../src/errors/domain-errors.js';

type MockRepo = {
    createUser: ReturnType<typeof vi.fn>;
    findUserByUsername: ReturnType<typeof vi.fn>;
    storeRefreshToken: ReturnType<typeof vi.fn>;
    findRefreshTokenByHash: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshTokenFamily: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): MockRepo {
    return {
        createUser: vi.fn(),
        findUserByUsername: vi.fn(),
        storeRefreshToken: vi.fn(),
        findRefreshTokenByHash: vi.fn(),
        revokeRefreshToken: vi.fn(),
        revokeRefreshTokenFamily: vi.fn(),
    };
}

describe('AuthService', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'unit-test-secret';
    });

    it('register_ok hashes password and never stores plaintext', async () => {
        const repo = buildRepoMock();
        repo.createUser.mockResolvedValue(7);

        const service = new AuthService(repo as any);
        const result = await service.register('alice', 'password123');

        expect(result.user.id).toBe(7);
        expect(result.accessToken).toBeTypeOf('string');
        expect(result.refreshToken).toBeTypeOf('string');
        expect(repo.createUser).toHaveBeenCalledTimes(1);

        const [, storedHash] = repo.createUser.mock.calls.at(0)!;
        expect(storedHash).not.toBe('password123');
        expect(await bcrypt.compare('password123', storedHash)).toBe(true);
    });

    it('register_user_exists throws UserAlreadyExistsError', async () => {
        const repo = buildRepoMock();
        repo.createUser.mockRejectedValue({ code: 'SQLITE_CONSTRAINT' });

        const service = new AuthService(repo as any);

        await expect(service.register('alice', 'password123')).rejects.toBeInstanceOf(
            UserAlreadyExistsError
        );
    });

    it('login_ok returns access token', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue({
            id: 4,
            username: 'bob',
            password_hash: await bcrypt.hash('password123', 4),
        });

        const service = new AuthService(repo as any);
        const result = await service.login('bob', 'password123');

        expect(result.user.id).toBe(4);
        expect(result.accessToken).toBeTypeOf('string');
        expect(result.refreshToken).toBeTypeOf('string');
    });

    it('login_bad_credentials throws BadCredentialsError', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue(null);

        const service = new AuthService(repo as any);

        await expect(service.login('ghost', 'password123')).rejects.toBeInstanceOf(
            BadCredentialsError
        );
    });

    it('refresh_ok rotates refresh token and returns new tokens', async () => {
        const repo = buildRepoMock();
        const oldToken = 'old-refresh-token';
        const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');

        repo.findRefreshTokenByHash.mockImplementation(async (tokenHash: string) => {
            if (tokenHash !== oldHash) {
                return null;
            }

            return {
                id: 15,
                user_id: 9,
                token_hash: oldHash,
                family_id: 'family-1',
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                revoked_at: null,
            };
        });

        const service = new AuthService(repo as any);
        (service as any).generateOpaqueToken = () => 'new-refresh-token';

        const result = await service.refresh(oldToken);

        expect(result.accessToken).toBeTypeOf('string');
        expect(result.refreshToken).toBe('new-refresh-token');
        expect(repo.revokeRefreshToken).toHaveBeenCalledWith(15);
        expect(repo.storeRefreshToken).toHaveBeenCalledTimes(1);

        const [storedUserId, , storedFamilyId] = repo.storeRefreshToken.mock.calls.at(0)!;
        expect(storedUserId).toBe(9);
        expect(storedFamilyId).toBe('family-1');
    });

    it('refresh_invalid_or_expired_or_revoked returns InvalidRefreshTokenError', async () => {
        const repo = buildRepoMock();
        const service = new AuthService(repo as any);

        await expect(service.refresh('missing-token')).rejects.toBeInstanceOf(
            InvalidRefreshTokenError
        );

        const revokedToken = 'revoked-token';
        const revokedHash = crypto.createHash('sha256').update(revokedToken).digest('hex');
        repo.findRefreshTokenByHash.mockResolvedValueOnce({
            id: 20,
            user_id: 2,
            token_hash: revokedHash,
            family_id: 'family-r',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            revoked_at: new Date().toISOString(),
        });

        await expect(service.refresh(revokedToken)).rejects.toBeInstanceOf(
            InvalidRefreshTokenError
        );
        expect(repo.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-r');

        const expiredToken = 'expired-token';
        const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
        repo.findRefreshTokenByHash.mockResolvedValueOnce({
            id: 21,
            user_id: 2,
            token_hash: expiredHash,
            family_id: 'family-e',
            expires_at: new Date(Date.now() - 60_000).toISOString(),
            revoked_at: null,
        });

        await expect(service.refresh(expiredToken)).rejects.toBeInstanceOf(
            InvalidRefreshTokenError
        );
        expect(repo.revokeRefreshToken).toHaveBeenCalledWith(21);
    });

    it('issued access token contains tokenType access', async () => {
        const repo = buildRepoMock();
        repo.createUser.mockResolvedValue(11);

        const service = new AuthService(repo as any);
        const result = await service.register('carol', 'password123');

        const decoded = jwt.decode(result.accessToken) as jwt.JwtPayload | null;
        expect(decoded).not.toBeNull();
        expect(decoded!.tokenType).toBe('access');
    });
});
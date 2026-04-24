import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import {randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/services/auth.service.js';
import {
    BadCredentialsError,
    InvalidRefreshTokenError,
    UserAlreadyExistsError,
} from '../src/errors/domain-errors.js';
import { authActiveRefreshTokens, setActiveRefreshTokens } from '../src/metrics.js';


function scryptAsync(
    password: string,
    salt: string,
    keylen: number,
    options: crypto.ScryptOptions
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keylen, options, (err, derived) => {
            if (err) reject(err);
            else resolve(derived);
        });
    });
}
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

async function hashPasswordForTest(password: string): Promise<string> {
    const salt = randomBytes(32).toString('hex');
    const hash = (await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS)) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
}

async function readActiveRefreshTokenGauge(): Promise<number> {
    const metric = await authActiveRefreshTokens.get();
    return metric.values[0]?.value ?? 0;
}

type MockRepo = {
    createUser: ReturnType<typeof vi.fn>;
    findUserByUsername: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    countActiveSessions: ReturnType<typeof vi.fn>;
    revokeOldestActiveSession: ReturnType<typeof vi.fn>;
    storeRefreshToken: ReturnType<typeof vi.fn>;
    findRefreshTokenByHash: ReturnType<typeof vi.fn>;
    revokeRefreshToken: ReturnType<typeof vi.fn>;
    revokeRefreshTokenFamily: ReturnType<typeof vi.fn>;
    revokeAllUserSessions: ReturnType<typeof vi.fn>;
    revokeSessionById: ReturnType<typeof vi.fn>;
    findUserById: ReturnType<typeof vi.fn>;
};

function buildRepoMock(): MockRepo {
    return {
        createUser: vi.fn(),
        findUserByUsername: vi.fn(),
        createSession: vi.fn(),
        countActiveSessions: vi.fn().mockResolvedValue(0),
        revokeOldestActiveSession: vi.fn().mockResolvedValue(0),
        storeRefreshToken: vi.fn(),
        findRefreshTokenByHash: vi.fn(),
        revokeRefreshToken: vi.fn(),
        revokeRefreshTokenFamily: vi.fn(),
        revokeAllUserSessions: vi.fn(),
        revokeSessionById: vi.fn(),
        findUserById: vi.fn(),
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

        // Verifica que el hash almacenado tiene formato salt:hex (scrypt)
        const [, storedHash] = repo.createUser.mock.calls.at(0)!;
        expect(storedHash).not.toBe('password123');
        expect(storedHash).toMatch(/^[a-f0-9]{64}:[a-f0-9]{128}$/);
    });

    it('register_user_exists throws UserAlreadyExistsError on PG unique constraint (23505)', async () => {
        const repo = buildRepoMock();
        repo.createUser.mockRejectedValue({ code: '23505' });

        const service = new AuthService(repo as any);

        await expect(service.register('alice', 'password123')).rejects.toBeInstanceOf(
            UserAlreadyExistsError
        );
    });

    it('login_ok returns access token with scrypt-hashed password', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue({
            id: 4,
            username: 'bob',
            password_hash: await hashPasswordForTest('password123'),
        });

        const service = new AuthService(repo as any);
        const result = await service.login('bob', 'password123');

        expect(result.user.id).toBe(4);
        expect(result.accessToken).toBeTypeOf('string');
        expect(result.refreshToken).toBeTypeOf('string');
    });

    it('login_wrong_password throws BadCredentialsError', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue({
            id: 4,
            username: 'bob',
            password_hash: await hashPasswordForTest('password123'),
        });

        const service = new AuthService(repo as any);

        await expect(service.login('bob', 'wrongpassword')).rejects.toBeInstanceOf(
            BadCredentialsError
        );
    });

    it('login_bad_credentials throws BadCredentialsError when user not found', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue(null);

        const service = new AuthService(repo as any);

        await expect(service.login('ghost', 'password123')).rejects.toBeInstanceOf(
            BadCredentialsError
        );
    });

    it('login_revokes_oldest_session when active sessions >= 3', async () => {
        const repo = buildRepoMock();
        repo.findUserByUsername.mockResolvedValue({
            id: 5,
            username: 'charlie',
            password_hash: await hashPasswordForTest('password123'),
        });
        repo.countActiveSessions.mockResolvedValue(3);
        repo.revokeOldestActiveSession.mockResolvedValue(1);

        const service = new AuthService(repo as any);
        await service.login('charlie', 'password123');

        expect(repo.revokeOldestActiveSession).toHaveBeenCalledWith(5);
    });

    it('refresh_ok rotates refresh token and returns new tokens', async () => {
        const repo = buildRepoMock();
        const oldToken = 'old-refresh-token';
        const oldHash = crypto.createHash('sha256').update(oldToken).digest('hex');
        repo.findUserById.mockResolvedValue({ id: 9, username: 'testuser' });
        repo.findRefreshTokenByHash.mockImplementation(async (tokenHash: string) => {
            if (tokenHash !== oldHash) return null;
            return {
                id: 15,
                user_id: 9,
                session_id: 'sess-x',
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

        const [storedUserId, , , storedFamilyId] = repo.storeRefreshToken.mock.calls.at(0)!;
        expect(storedUserId).toBe(9);
        expect(storedFamilyId).toBe('family-1');
    });

    it('refresh_missing_token throws InvalidRefreshTokenError', async () => {
        const repo = buildRepoMock();
        const service = new AuthService(repo as any);
        await expect(service.refresh(undefined)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('refresh_token_not_found throws InvalidRefreshTokenError', async () => {
        const repo = buildRepoMock();
        repo.findRefreshTokenByHash.mockResolvedValue(null);
        const service = new AuthService(repo as any);
        await expect(service.refresh('nonexistent-token')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('refresh_revoked_token revokes family and throws InvalidRefreshTokenError', async () => {
        const repo = buildRepoMock();
        const revokedToken = 'revoked-token';
        const revokedHash = crypto.createHash('sha256').update(revokedToken).digest('hex');
        repo.findRefreshTokenByHash.mockResolvedValue({
            id: 20,
            user_id: 2,
            session_id: 'sess-r',
            token_hash: revokedHash,
            family_id: 'family-r',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            revoked_at: new Date().toISOString(),
        });
        repo.revokeRefreshTokenFamily.mockResolvedValue(2);

        const service = new AuthService(repo as any);
        await expect(service.refresh(revokedToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        expect(repo.revokeRefreshTokenFamily).toHaveBeenCalledWith('family-r');
    });

    it('refresh_expired_token revokes token and throws InvalidRefreshTokenError', async () => {
        const repo = buildRepoMock();
        const expiredToken = 'expired-token';
        const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
        repo.findRefreshTokenByHash.mockResolvedValue({
            id: 21,
            user_id: 2,
            session_id: 'sess-e',
            token_hash: expiredHash,
            family_id: 'family-e',
            expires_at: new Date(Date.now() - 60_000).toISOString(),
            revoked_at: null,
        });
        repo.revokeRefreshToken.mockResolvedValue(1);

        const service = new AuthService(repo as any);
        await expect(service.refresh(expiredToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
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

    it('logout calls revokeSessionById', async () => {
        const repo = buildRepoMock();
        repo.revokeSessionById.mockResolvedValue(1);
        const service = new AuthService(repo as any);
        await service.logout('sess-abc');
        expect(repo.revokeSessionById).toHaveBeenCalledWith('sess-abc');
    });

    it('logout decrements the active refresh token gauge by revoked token count', async () => {
        const repo = buildRepoMock();
        repo.revokeSessionById.mockResolvedValue(2);
        setActiveRefreshTokens(10);

        const service = new AuthService(repo as any);
        await service.logout('sess-abc');

        expect(await readActiveRefreshTokenGauge()).toBe(8);
    });

    it('logout without sessionId does nothing', async () => {
        const repo = buildRepoMock();
        const service = new AuthService(repo as any);
        await service.logout(undefined);
        expect(repo.revokeSessionById).not.toHaveBeenCalled();
    });

    it('logoutAll calls revokeAllUserSessions', async () => {
        const repo = buildRepoMock();
        repo.revokeAllUserSessions.mockResolvedValue(2);
        const service = new AuthService(repo as any);
        await service.logoutAll(42);
        expect(repo.revokeAllUserSessions).toHaveBeenCalledWith(42);
    });

    it('logoutAll decrements the active refresh token gauge by revoked token count', async () => {
        const repo = buildRepoMock();
        repo.revokeAllUserSessions.mockResolvedValue(3);
        setActiveRefreshTokens(10);

        const service = new AuthService(repo as any);
        await service.logoutAll(42);

        expect(await readActiveRefreshTokenGauge()).toBe(7);
    });
});

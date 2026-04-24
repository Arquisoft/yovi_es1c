import jwt from 'jsonwebtoken';
import crypto, { randomBytes, timingSafeEqual } from 'node:crypto';
import { CredentialsRepository } from '../repositories/credentials.repository.js';
import {
    BadCredentialsError,
    InvalidRefreshTokenError,
    UnexpectedError,
    UserAlreadyExistsError,
} from '../errors/domain-errors.js';
import {
    decrementActiveRefreshTokens,
    incrementActiveRefreshTokens,
    recordLoginAttempt,
    recordSimpleLoginAttempt,
    recordRefreshAttempt,
    recordRefreshTokenIssued,
    recordRefreshTokenRevocation,
    recordRegisterAttempt,
    recordTokensIssued,
    startBcryptCompareTimer,
    startBcryptHashTimer,
    startJwtSignTimer,
} from '../metrics.js';

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
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 32;
const KEY_LEN = 64;

async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES).toString('hex');
    const hash = (await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS)) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, hashHex] = stored.split(':');
    if (!salt || !hashHex) return false;
    const storedHash = Buffer.from(hashHex, 'hex');
    const derived = (await scryptAsync(password, salt, KEY_LEN, SCRYPT_PARAMS)) as Buffer;
    return timingSafeEqual(derived, storedHash);
}

function hasUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: unknown }).code === '23505';
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    user: {
        id: number;
        username: string;
    };
    session: {
        sessionId: string;
        deviceId: string;
    };
};

export class AuthService {
    constructor(private repo: CredentialsRepository) { }

    async register(username: string, password: string, deviceId = 'web', deviceName?: string): Promise<AuthResponse> {
        try {
            // startBcryptHashTimer se mantiene para no romper dashboards Grafana existentes
            const endHash = startBcryptHashTimer();
            let passwordHash: string;

            try {
                passwordHash = await hashPassword(password);
            } finally {
                endHash();
            }

            const userId = await this.repo.createUser(username, passwordHash);
            await this.createUserProfile(userId, username);
            const session = await this.issueSession(userId, username, deviceId, deviceName);

            recordRegisterAttempt('success');

            return {
                ...session,
                user: {
                    id: userId,
                    username,
                },
            };
        } catch (error: unknown) {
            if (hasUniqueConstraintError(error)) {
                recordRegisterAttempt('user_exists');
                throw new UserAlreadyExistsError();
            }

            if (error instanceof UserAlreadyExistsError || error instanceof UnexpectedError) {
                throw error;
            }

            recordRegisterAttempt('unexpected_error');
            throw new UnexpectedError();
        }
    }

    async login(username: string, password: string, deviceId = 'web', deviceName?: string): Promise<AuthResponse> {
        try {
            const user = await this.repo.findUserByUsername(username);

            if (!user) {
                recordLoginAttempt('bad_credentials');
                recordSimpleLoginAttempt('failure');
                throw new BadCredentialsError();
            }

            const endCompare = startBcryptCompareTimer();
            let isPasswordValid = false;

            try {
                isPasswordValid = await verifyPassword(password, user.password_hash);
            } finally {
                endCompare();
            }

            if (!isPasswordValid) {
                recordLoginAttempt('bad_credentials');
                recordSimpleLoginAttempt('failure');
                throw new BadCredentialsError();
            }

            const activeSessions = await this.repo.countActiveSessions(user.id);
            if (activeSessions >= 3) {
                const revokedOldest = await this.repo.revokeOldestActiveSession(user.id);
                if (revokedOldest > 0) {
                    recordRefreshTokenRevocation('login_revoke_all', revokedOldest);
                }
            }

            const session = await this.issueSession(user.id, user.username, deviceId, deviceName);

            recordLoginAttempt('success');
            recordSimpleLoginAttempt('success');

            return {
                ...session,
                user: {
                    id: user.id,
                    username: user.username,
                },
            };
        } catch (error) {
            if (error instanceof BadCredentialsError || error instanceof UnexpectedError) {
                throw error;
            }

            recordLoginAttempt('unexpected_error');
            recordSimpleLoginAttempt('failure');
            throw new UnexpectedError();
        }
    }

    async refresh(refreshToken?: string): Promise<{ accessToken: string; refreshToken: string; session: { sessionId: string } }> {
        try {
            if (!refreshToken) {
                recordRefreshAttempt('missing_token');
                throw new InvalidRefreshTokenError();
            }

            const tokenHash = this.hashRefreshToken(refreshToken);
            const storedToken = await this.repo.findRefreshTokenByHash(tokenHash);

            if (!storedToken) {
                recordRefreshAttempt('token_not_found');
                throw new InvalidRefreshTokenError();
            }

            if (storedToken.revoked_at) {
                const revokedFamily = await this.repo.revokeRefreshTokenFamily(storedToken.family_id);

                if (revokedFamily > 0) {
                    recordRefreshTokenRevocation('refresh_token_reuse', revokedFamily);
                    decrementActiveRefreshTokens(revokedFamily);
                }

                recordRefreshAttempt('revoked_token');
                throw new InvalidRefreshTokenError();
            }

            const expiresAt = new Date(storedToken.expires_at).getTime();
            if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
                const revokedExpired = await this.repo.revokeRefreshToken(storedToken.id);

                if (revokedExpired > 0) {
                    recordRefreshTokenRevocation('refresh_expired', revokedExpired);
                    decrementActiveRefreshTokens(revokedExpired);
                }

                recordRefreshAttempt('expired_token');
                throw new InvalidRefreshTokenError();
            }

            const revokedRotated = await this.repo.revokeRefreshToken(storedToken.id);
            if (revokedRotated > 0) {
                recordRefreshTokenRevocation('refresh_rotation', revokedRotated);
                decrementActiveRefreshTokens(revokedRotated);
            }

            const nextRefreshToken = this.generateOpaqueToken();
            const nextRefreshHash = this.hashRefreshToken(nextRefreshToken);
            const nextRefreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

            await this.repo.storeRefreshToken(
                storedToken.user_id,
                storedToken.session_id,
                nextRefreshHash,
                storedToken.family_id,
                nextRefreshExpires
            );

            recordRefreshTokenIssued();
            incrementActiveRefreshTokens();

            const user = await this.repo.findUserById(storedToken.user_id);
            const usernameResolved = user?.username;
            const accessToken = this.signAccessToken(storedToken.user_id, storedToken.session_id, usernameResolved);

            recordRefreshAttempt('success');

            return {
                accessToken,
                refreshToken: nextRefreshToken,
                session: {
                    sessionId: storedToken.session_id,
                },
            };
        } catch (error) {
            if (error instanceof InvalidRefreshTokenError || error instanceof UnexpectedError) {
                throw error;
            }

            recordRefreshAttempt('unexpected_error');
            throw new UnexpectedError();
        }
    }

    async logout(sessionId?: string): Promise<void> {
        if (!sessionId) return;
        await this.repo.revokeSessionById(sessionId);
    }

    async logoutAll(userId: number): Promise<void> {
        await this.repo.revokeAllUserSessions(userId);
    }

    private async issueSession(userId: number, username: string, deviceId: string, deviceName?: string) {
        const sessionId = crypto.randomUUID();
        await this.repo.createSession(sessionId, userId, deviceId, deviceName);

        const accessToken = this.signAccessToken(userId, sessionId, username);
        const refreshToken = this.generateOpaqueToken();
        const refreshHash = this.hashRefreshToken(refreshToken);
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
        const familyId = crypto.randomUUID();

        await this.repo.storeRefreshToken(userId, sessionId, refreshHash, familyId, refreshExpiresAt);

        recordRefreshTokenIssued();
        incrementActiveRefreshTokens();

        return {
            accessToken,
            refreshToken,
            session: {
                sessionId,
                deviceId,
            },
        };
    }

    private signAccessToken(userId: number, sessionId: string, username?: string) {
        const endSign = startJwtSignTimer();

        try {
            recordTokensIssued();
            return jwt.sign(
                {
                    ...(username ? { username } : {}),
                    sid: sessionId,
                    tokenType: 'access',
                },
                process.env.JWT_SECRET!,
                {
                    expiresIn: ACCESS_TOKEN_TTL,
                    subject: String(userId),
                    algorithm: 'HS256',
                }
            );
        } catch {
            throw new UnexpectedError();
        } finally {
            endSign();
        }
    }

    private generateOpaqueToken(): string {
        return crypto.randomBytes(48).toString('base64url');
    }

    private hashRefreshToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private async createUserProfile(userId: number, username: string): Promise<void> {
        const usersServiceUrl = process.env.USERS_SERVICE_URL;

        const response = await fetch(`${usersServiceUrl}/api/users/profiles`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userId,
                username,
                avatar: '/avatars/avatar01.png'
            })
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Users error:", text);
            throw new Error(`Failed to create profile: ${text}`);
        }
    }
}

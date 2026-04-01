import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
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

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hasSqliteConstraintCode(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT';
}

type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    user: {
        id: number;
        username: string;
    };
};

export class AuthService {
    constructor(private repo: CredentialsRepository) {}

    async register(username: string, password: string): Promise<AuthResponse> {
        try {
            const endHash = startBcryptHashTimer();
            let passwordHash: string;

            try {
                passwordHash = await bcrypt.hash(password, 12);
            } finally {
                endHash();
            }

            const userId = await this.repo.createUser(username, passwordHash);
            const session = await this.issueSession(userId, username);

            recordRegisterAttempt('success');

            return {
                ...session,
                user: {
                    id: userId,
                    username,
                },
            };
        } catch (error: unknown) {
            if (hasSqliteConstraintCode(error)) {
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

    async login(username: string, password: string): Promise<AuthResponse> {
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
                isPasswordValid = await bcrypt.compare(password, user.password_hash);
            } finally {
                endCompare();
            }

            if (!isPasswordValid) {
                recordLoginAttempt('bad_credentials');
                recordSimpleLoginAttempt('failure');
                throw new BadCredentialsError();
            }

            const revokedSessions = await this.repo.revokeAllUserSessions(user.id);
            if (revokedSessions > 0) {
                recordRefreshTokenRevocation('login_revoke_all', revokedSessions);
                decrementActiveRefreshTokens(revokedSessions);
            }

            const session = await this.issueSession(user.id, user.username);

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

    async refresh(refreshToken?: string): Promise<{ accessToken: string; refreshToken: string }> {
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
                nextRefreshHash,
                storedToken.family_id,
                nextRefreshExpires
            );

            recordRefreshTokenIssued();
            incrementActiveRefreshTokens();

            const user = await this.repo.findUserById(storedToken.user_id);
            const usernameResolved = user?.username;
            const accessToken = this.signAccessToken(storedToken.user_id, usernameResolved);

            recordRefreshAttempt('success');

            return {
                accessToken,
                refreshToken: nextRefreshToken,
            };
        } catch (error) {
            if (error instanceof InvalidRefreshTokenError || error instanceof UnexpectedError) {
                throw error;
            }

            recordRefreshAttempt('unexpected_error');
            throw new UnexpectedError();
        }
    }

    private async issueSession(userId: number, username: string) {
        const accessToken = this.signAccessToken(userId, username);
        const refreshToken = this.generateOpaqueToken();
        const refreshHash = this.hashRefreshToken(refreshToken);
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
        const familyId = crypto.randomUUID();

        await this.repo.storeRefreshToken(userId, refreshHash, familyId, refreshExpiresAt);

        recordRefreshTokenIssued();
        incrementActiveRefreshTokens();

        return {
            accessToken,
            refreshToken,
        };
    }

    private signAccessToken(userId: number, username?: string) {
        const endSign = startJwtSignTimer();

        try {
            recordTokensIssued();
            return jwt.sign(
                {
                    ...(username ? { username } : {}),
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
}
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

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
        const passwordHash = await bcrypt.hash(password, 12);

        let userId: number;

        try {
            userId = await this.repo.createUser(username, passwordHash);
        } catch (error: any) {
            if (error?.code === 'SQLITE_CONSTRAINT') {
                throw new UserAlreadyExistsError();
            }

            throw new UnexpectedError();
        }

        const session = await this.issueSession(userId, username);

        return {
            ...session,
            user: {
                id: userId,
                username,
            },
        };
    }

    async login(username: string, password: string): Promise<AuthResponse> {
        const user = await this.repo.findUserByUsername(username);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            throw new BadCredentialsError();
        }

        const session = await this.issueSession(user.id, user.username);

        return {
            ...session,
            user: {
                id: user.id,
                username: user.username,
            },
        };
    }

    async refresh(refreshToken?: string): Promise<{ accessToken: string; refreshToken: string }> {
        if (!refreshToken) {
            throw new InvalidRefreshTokenError();
        }

        const tokenHash = this.hashRefreshToken(refreshToken);
        const storedToken = await this.repo.findRefreshTokenByHash(tokenHash);

        if (!storedToken) {
            throw new InvalidRefreshTokenError();
        }

        if (storedToken.revoked_at) {
            await this.repo.revokeRefreshTokenFamily(storedToken.family_id);
            throw new InvalidRefreshTokenError();
        }

        const expiresAt = new Date(storedToken.expires_at).getTime();
        if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
            await this.repo.revokeRefreshToken(storedToken.id);
            throw new InvalidRefreshTokenError();
        }

        await this.repo.revokeRefreshToken(storedToken.id);

        const nextRefreshToken = this.generateOpaqueToken();
        const nextRefreshHash = this.hashRefreshToken(nextRefreshToken);
        const nextRefreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

        await this.repo.storeRefreshToken(
            storedToken.user_id,
            nextRefreshHash,
            storedToken.family_id,
            nextRefreshExpires
        );

        const accessToken = this.signAccessToken(storedToken.user_id);

        return {
            accessToken,
            refreshToken: nextRefreshToken,
        };
    }

    private async issueSession(userId: number, username: string) {
        const accessToken = this.signAccessToken(userId, username);
        const refreshToken = this.generateOpaqueToken();
        const refreshHash = this.hashRefreshToken(refreshToken);
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
        const familyId = crypto.randomUUID();

        await this.repo.storeRefreshToken(userId, refreshHash, familyId, refreshExpiresAt);

        return {
            accessToken,
            refreshToken,
        };
    }

    private signAccessToken(userId: number, username?: string) {
        try {
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
        }
    }

    private generateOpaqueToken(): string {
        return crypto.randomBytes(48).toString('base64url');
    }

    private hashRefreshToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
}

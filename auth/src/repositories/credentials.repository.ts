import sqlite3 from 'sqlite3';
import { startDbOperationTimer, type DbOperation } from '../metrics.js';

export type RefreshTokenRecord = {
    id: number;
    user_id: number;
    token_hash: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
};

type SqlRunContext = {
    lastID?: number;
    changes?: number;
};

export class CredentialsRepository {
    private db: sqlite3.Database;

    constructor(dbPath: string) {
        this.db = new sqlite3.Database(dbPath);
    }

    private async withDbMetrics<T>(operation: DbOperation, action: () => Promise<T>): Promise<T> {
        const endTimer = startDbOperationTimer(operation);

        try {
            const result = await action();
            endTimer('success');
            return result;
        } catch (error) {
            endTimer('error');
            throw error;
        }
    }

    async createUser(username: string, passwordHash: string): Promise<number> {
        return this.withDbMetrics('create_user', () => new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users_credentials (username, password_hash) VALUES (?, ?)',
                [username, passwordHash],
                function(this: SqlRunContext, err: Error | null) {
                    if (err) reject(err);
                    else resolve(this.lastID ?? 0);
                }
            );
        }));
    }

    async findUserByUsername(username: string): Promise<{ id: number; username: string; password_hash: string } | null> {
        return this.withDbMetrics('find_user_by_username', () => new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username, password_hash FROM users_credentials WHERE username = ?',
                [username],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        }));
    }

    async findUserById(userId: number): Promise<{ id: number; username: string } | null> {
        return this.withDbMetrics('find_user_by_id', () => new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username FROM users_credentials WHERE id = ?',
                [userId],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        }));
    }

    async storeRefreshToken(userId: number, tokenHash: string, familyId: string, expiresAt: string): Promise<void> {
        return this.withDbMetrics('store_refresh_token', () => new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
                 VALUES (?, ?, ?, ?)`,
                [userId, tokenHash, familyId, expiresAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        }));
    }

    async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
        return this.withDbMetrics('find_refresh_token_by_hash', () => new Promise((resolve, reject) => {
            this.db.get(
                `SELECT id, user_id, token_hash, family_id, expires_at, revoked_at
                 FROM refresh_tokens
                 WHERE token_hash = ?`,
                [tokenHash],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        }));
    }

    async revokeRefreshToken(tokenId: number): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token', () => new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL',
                [tokenId],
                function(this: SqlRunContext, err: Error | null) {
                    if (err) reject(err);
                    else resolve(this.changes ?? 0);
                }
            );
        }));
    }

    async revokeRefreshTokenFamily(familyId: string): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token_family', () => new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE refresh_tokens
                 SET revoked_at = CURRENT_TIMESTAMP
                 WHERE family_id = ? AND revoked_at IS NULL`,
                [familyId],
                function(this: SqlRunContext, err: Error | null) {
                    if (err) reject(err);
                    else resolve(this.changes ?? 0);
                }
            );
        }));
    }

    async revokeAllUserSessions(userId: number): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', () => new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE refresh_tokens
                 SET revoked_at = CURRENT_TIMESTAMP
                 WHERE user_id = ? AND revoked_at IS NULL`,
                [userId],
                function(this: SqlRunContext, err: Error | null) {
                    if (err) reject(err);
                    else resolve(this.changes ?? 0);
                }
            );
        }));
    }

    async countActiveRefreshTokens(): Promise<number> {
        return this.withDbMetrics('count_active_refresh_tokens', () => new Promise((resolve, reject) => {
            this.db.get(
                `SELECT COUNT(*) AS total
                 FROM refresh_tokens
                 WHERE revoked_at IS NULL
                   AND datetime(expires_at) > datetime('now')`,
                [],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(Number(row?.total ?? 0));
                }
            );
        }));
    }
}
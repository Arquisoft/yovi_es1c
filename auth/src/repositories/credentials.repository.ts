import sqlite3 from 'sqlite3';
import { startDbOperationTimer, type DbOperation } from '../metrics.js';

export type RefreshTokenRecord = {
    id: number;
    user_id: number;
    session_id: string;
    token_hash: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
};

type SqlRunContext = {
    lastID?: number;
    changes?: number;
};

type PromiseCallbacks = {
    resolve: (value: number) => void;
    reject: (reason: unknown) => void;
};

// ── Helper: crea un callback para db.run que resuelve/rechaza la Promise ──
function makeRunCallback(
    { resolve, reject }: PromiseCallbacks,
    getValue: (ctx: SqlRunContext) => number = (ctx) => ctx.changes ?? 0
): (this: SqlRunContext, err: Error | null) => void {
    return function(this: SqlRunContext, err: Error | null) {
        if (err) reject(err);
        else resolve(getValue(this));
    };
}

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

    private revokeTokensBySessionId(sessionId: string, callbacks: PromiseCallbacks): void {
        this.db.run(
            `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
             WHERE session_id = ? AND revoked_at IS NULL`,
            [sessionId],
            makeRunCallback(callbacks)
        );
    }

    async createUser(username: string, passwordHash: string): Promise<number> {
        return this.withDbMetrics('create_user', () => new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users_credentials (username, password_hash) VALUES (?, ?)',
                [username, passwordHash],
                makeRunCallback({ resolve, reject }, (ctx) => ctx.lastID ?? 0)
            );
        }));
    }

    async findUserByUsername(username: string): Promise<{ id: number; username: string; password_hash: string } | null> {
        return this.withDbMetrics('find_user_by_username', () => new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username, password_hash FROM users_credentials WHERE username = ?',
                [username],
                (err, row: any) => { if (err) reject(err); else resolve(row || null); }
            );
        }));
    }

    async findUserById(userId: number): Promise<{ id: number; username: string } | null> {
        return this.withDbMetrics('find_user_by_id', () => new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username FROM users_credentials WHERE id = ?',
                [userId],
                (err, row: any) => { if (err) reject(err); else resolve(row || null); }
            );
        }));
    }

    async createSession(sessionId: string, userId: number, deviceId: string, deviceName?: string): Promise<void> {
        return this.withDbMetrics('store_refresh_token', () => new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO sessions (id, user_id, device_id, device_name) VALUES (?, ?, ?, ?)`,
                [sessionId, userId, deviceId, deviceName ?? null],
                (err) => { if (err) reject(err); else resolve(); }
            );
        }));
    }

    async countActiveSessions(userId: number): Promise<number> {
        return this.withDbMetrics('count_active_refresh_tokens', () => new Promise((resolve, reject) => {
            this.db.get(
                `SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND revoked_at IS NULL`,
                [userId],
                (err, row: any) => { if (err) reject(err); else resolve(Number(row?.total ?? 0)); }
            );
        }));
    }

    async revokeOldestActiveSession(userId: number): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', () => new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.get(
                    `SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL
                     ORDER BY datetime(created_at) ASC LIMIT 1`,
                    [userId],
                    (selectErr, row: any) => {
                        if (selectErr) { reject(selectErr); return; }
                        const sessionId = row?.id;
                        if (!sessionId) { resolve(0); return; }
                        this.revokeOldestSessionAndTokens(sessionId, { resolve, reject });
                    }
                );
            });
        }));
    }

    private revokeOldestSessionAndTokens(sessionId: string, callbacks: PromiseCallbacks): void {
        this.db.run(
            `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
             WHERE id = ? AND revoked_at IS NULL`,
            [sessionId],
            function(this: SqlRunContext, updateErr: Error | null) {
                if (updateErr) { callbacks.reject(updateErr); return; }
                if ((this.changes ?? 0) === 0) { callbacks.resolve(0); return; }
            }
        );
        this.revokeTokensBySessionId(sessionId, callbacks);
    }

    async storeRefreshToken(userId: number, sessionId: string, tokenHash: string, familyId: string, expiresAt: string): Promise<void> {
        return this.withDbMetrics('store_refresh_token', () => new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO refresh_tokens (user_id, session_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?, ?)`,
                [userId, sessionId, tokenHash, familyId, expiresAt],
                (err) => { if (err) reject(err); else resolve(); }
            );
        }));
    }

    async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
        return this.withDbMetrics('find_refresh_token_by_hash', () => new Promise((resolve, reject) => {
            this.db.get(
                `SELECT id, user_id, session_id, token_hash, family_id, expires_at, revoked_at
                 FROM refresh_tokens WHERE token_hash = ?`,
                [tokenHash],
                (err, row: any) => { if (err) reject(err); else resolve(row || null); }
            );
        }));
    }

    async revokeRefreshToken(tokenId: number): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token', () => new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL',
                [tokenId],
                makeRunCallback({ resolve, reject })
            );
        }));
    }

    async revokeRefreshTokenFamily(familyId: string): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token_family', () => new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
                 WHERE family_id = ? AND revoked_at IS NULL`,
                [familyId],
                makeRunCallback({ resolve, reject })
            );
        }));
    }

    async revokeAllUserSessions(userId: number): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', () => new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(
                    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
                     WHERE user_id = ? AND revoked_at IS NULL`,
                    [userId],
                    (sessionErr) => {
                        if (sessionErr) { reject(sessionErr); return; }
                        this.revokeTokensByUserId(userId, { resolve, reject });
                    }
                );
            });
        }));
    }

    private revokeTokensByUserId(userId: number, callbacks: PromiseCallbacks): void {
        this.db.run(
            `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
             WHERE user_id = ? AND revoked_at IS NULL`,
            [userId],
            makeRunCallback(callbacks)
        );
    }

    async revokeSessionById(sessionId: string): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', () => new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(
                    `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
                     WHERE id = ? AND revoked_at IS NULL`,
                    [sessionId],
                    (sessionErr) => {
                        if (sessionErr) { reject(sessionErr); return; }
                        this.revokeTokensBySessionId(sessionId, { resolve, reject });
                    }
                );
            });
        }));
    }

    async countActiveRefreshTokens(): Promise<number> {
        return this.withDbMetrics('count_active_refresh_tokens', () => new Promise((resolve, reject) => {
            this.db.get(
                `SELECT COUNT(*) AS total FROM refresh_tokens
                 WHERE revoked_at IS NULL AND datetime(expires_at) > datetime('now')`,
                [],
                (err, row: any) => { if (err) reject(err); else resolve(Number(row?.total ?? 0)); }
            );
        }));
    }
}
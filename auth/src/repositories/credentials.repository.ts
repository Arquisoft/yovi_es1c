import pg from 'pg';
import { startDbOperationTimer, type DbOperation } from '../metrics.js';

const { Pool } = pg;

export type RefreshTokenRecord = {
    id: number;
    user_id: number;
    session_id: string;
    token_hash: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
};

const pool = new Pool({
    host:     process.env.PGHOST     ?? 'localhost',
    port:     Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'authdb',
    user:     process.env.PGUSER     ?? 'auth_user',
    password: process.env.PGPASSWORD ?? 'changeme',
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
});

export class CredentialsRepository {
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
        return this.withDbMetrics('create_user', async () => {
            const res = await pool.query(
                'INSERT INTO users_credentials (username, password_hash) VALUES ($1, $2) RETURNING id',
                [username, passwordHash]
            );
            return res.rows[0].id as number;
        });
    }

    async findUserByUsername(username: string): Promise<{ id: number; username: string; password_hash: string } | null> {
        return this.withDbMetrics('find_user_by_username', async () => {
            const res = await pool.query(
                'SELECT id, username, password_hash FROM users_credentials WHERE username = $1',
                [username]
            );
            return res.rows[0] ?? null;
        });
    }

    async findUserById(userId: number): Promise<{ id: number; username: string } | null> {
        return this.withDbMetrics('find_user_by_id', async () => {
            const res = await pool.query(
                'SELECT id, username FROM users_credentials WHERE id = $1',
                [userId]
            );
            return res.rows[0] ?? null;
        });
    }

    async createSession(sessionId: string, userId: number, deviceId: string, deviceName?: string): Promise<void> {
        return this.withDbMetrics('store_refresh_token', async () => {
            await pool.query(
                'INSERT INTO sessions (id, user_id, device_id, device_name) VALUES ($1, $2, $3, $4)',
                [sessionId, userId, deviceId, deviceName ?? null]
            );
        });
    }

    async countActiveSessions(userId: number): Promise<number> {
        return this.withDbMetrics('count_active_refresh_tokens', async () => {
            const res = await pool.query(
                'SELECT COUNT(*) AS total FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
                [userId]
            );
            return Number(res.rows[0]?.total ?? 0);
        });
    }

    async revokeOldestActiveSession(userId: number): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const sel = await client.query(
                    `SELECT id FROM sessions
                     WHERE user_id = $1 AND revoked_at IS NULL
                     ORDER BY created_at ASC LIMIT 1`,
                    [userId]
                );
                const sessionId = sel.rows[0]?.id;
                if (!sessionId) {
                    await client.query('COMMIT');
                    return 0;
                }
                await client.query(
                    `UPDATE sessions SET revoked_at = NOW()
                     WHERE id = $1 AND revoked_at IS NULL`,
                    [sessionId]
                );
                const upd = await client.query(
                    `UPDATE refresh_tokens SET revoked_at = NOW()
                     WHERE session_id = $1 AND revoked_at IS NULL`,
                    [sessionId]
                );
                await client.query('COMMIT');
                return upd.rowCount ?? 0;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        });
    }

    async storeRefreshToken(
        userId: number,
        sessionId: string,
        tokenHash: string,
        familyId: string,
        expiresAt: string
    ): Promise<void> {
        return this.withDbMetrics('store_refresh_token', async () => {
            await pool.query(
                `INSERT INTO refresh_tokens (user_id, session_id, token_hash, family_id, expires_at)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, sessionId, tokenHash, familyId, expiresAt]
            );
        });
    }

    async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
        return this.withDbMetrics('find_refresh_token_by_hash', async () => {
            const res = await pool.query(
                `SELECT id, user_id, session_id, token_hash, family_id, expires_at, revoked_at
                 FROM refresh_tokens WHERE token_hash = $1`,
                [tokenHash]
            );
            return res.rows[0] ?? null;
        });
    }

    async revokeRefreshToken(tokenId: number): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token', async () => {
            const res = await pool.query(
                `UPDATE refresh_tokens SET revoked_at = NOW()
                 WHERE id = $1 AND revoked_at IS NULL`,
                [tokenId]
            );
            return res.rowCount ?? 0;
        });
    }

    async revokeRefreshTokenFamily(familyId: string): Promise<number> {
        return this.withDbMetrics('revoke_refresh_token_family', async () => {
            const res = await pool.query(
                `UPDATE refresh_tokens SET revoked_at = NOW()
                 WHERE family_id = $1 AND revoked_at IS NULL`,
                [familyId]
            );
            return res.rowCount ?? 0;
        });
    }

    async revokeAllUserSessions(userId: number): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    `UPDATE sessions SET revoked_at = NOW()
                     WHERE user_id = $1 AND revoked_at IS NULL`,
                    [userId]
                );
                const res = await client.query(
                    `UPDATE refresh_tokens SET revoked_at = NOW()
                     WHERE user_id = $1 AND revoked_at IS NULL`,
                    [userId]
                );
                await client.query('COMMIT');
                return res.rowCount ?? 0;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        });
    }

    async revokeSessionById(sessionId: string): Promise<number> {
        return this.withDbMetrics('revoke_all_user_sessions', async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    `UPDATE sessions SET revoked_at = NOW()
                     WHERE id = $1 AND revoked_at IS NULL`,
                    [sessionId]
                );
                const res = await client.query(
                    `UPDATE refresh_tokens SET revoked_at = NOW()
                     WHERE session_id = $1 AND revoked_at IS NULL`,
                    [sessionId]
                );
                await client.query('COMMIT');
                return res.rowCount ?? 0;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        });
    }

    async countActiveRefreshTokens(): Promise<number> {
        return this.withDbMetrics('count_active_refresh_tokens', async () => {
            const res = await pool.query(
                `SELECT COUNT(*) AS total FROM refresh_tokens
                 WHERE revoked_at IS NULL AND expires_at > NOW()`
            );
            return Number(res.rows[0]?.total ?? 0);
        });
    }
}
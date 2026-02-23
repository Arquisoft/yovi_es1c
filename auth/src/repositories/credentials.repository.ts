import sqlite3 from 'sqlite3';

export type RefreshTokenRecord = {
    id: number;
    user_id: number;
    token_hash: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
};

export class CredentialsRepository {
    private db: sqlite3.Database;

    constructor(dbPath: string) {
        this.db = new sqlite3.Database(dbPath);
    }

    async createUser(username: string, passwordHash: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users_credentials (username, password_hash) VALUES (?, ?)',
                [username, passwordHash],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID!);
                }
            );
        });
    }

    async findUserByUsername(username: string): Promise<{ id: number; username: string; password_hash: string } | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, username, password_hash FROM users_credentials WHERE username = ?',
                [username],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        });
    }

    async storeRefreshToken(userId: number, tokenHash: string, familyId: string, expiresAt: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
                 VALUES (?, ?, ?, ?)`,
                [userId, tokenHash, familyId, expiresAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
        return new Promise((resolve, reject) => {
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
        });
    }

    async revokeRefreshToken(tokenId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL',
                [tokenId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async revokeRefreshTokenFamily(familyId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE refresh_tokens
                 SET revoked_at = CURRENT_TIMESTAMP
                 WHERE family_id = ? AND revoked_at IS NULL`,
                [familyId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

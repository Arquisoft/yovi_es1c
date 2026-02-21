import sqlite3 from 'sqlite3';

export class CredentialsRepository {
    private db: sqlite3.Database;

    constructor(dbPath: string) {
        this.db = new sqlite3.Database(dbPath);
        this.initDB();
    }

    private initDB() {
        this.db.serialize(() => {
            this.db.run(`
        CREATE TABLE IF NOT EXISTS users_credentials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

            this.db.run(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          token TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users_credentials (id),
          UNIQUE(token)
        )
      `);
        });
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

    async findUserByUsername(username: string): Promise<{ id: number; password_hash: string } | null> {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, password_hash FROM users_credentials WHERE username = ?',
                [username],
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row || null);
                }
            );
        });
    }
}

import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';

function openDatabase(dbPath: string): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(db);
        });
    });
}

function exec(db: sqlite3.Database, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function close(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

export async function initAuthDatabase(dbPath: string): Promise<void> {
    const dir = path.dirname(dbPath);
    if (dir && dir !== '.') {
        fs.mkdirSync(dir, { recursive: true });
    }

    const db = await openDatabase(dbPath);

    try {
        const sqlPath = path.resolve(process.cwd(), 'scripts/init-auth-db.sql');
        const initSql = fs.readFileSync(sqlPath, 'utf8');

        await exec(db, initSql);
    } finally {
        await close(db);
    }
}
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

export async function initAuthDatabase(): Promise<void> {
    const client = new Client({
        host:     process.env.PGHOST     ?? 'localhost',
        port:     Number(process.env.PGPORT ?? 5432),
        database: process.env.PGDATABASE ?? 'authdb',
        user:     process.env.PGUSER     ?? 'auth_user',
        password: process.env.PGPASSWORD ?? 'changeme',
    });

    await client.connect();

    try {
        const sqlPath = path.resolve(process.cwd(), 'scripts/init-auth-db.sql');
        const initSql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(initSql);
    } finally {
        await client.end();
    }
}
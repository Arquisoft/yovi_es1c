import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function initDB(): Promise<Pool> {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: Number(process.env.PGPOOL_MAX ?? 10),
  });

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(schema);

  console.log('Database initialized using PostgreSQL pool');
  return pool;
}
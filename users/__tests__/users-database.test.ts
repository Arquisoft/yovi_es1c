import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDB } from '../src/database/database.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

let db: any;

describe('Database initialization', () => {
  const dataDir = '/app/data';
  const dbPath = path.join(dataDir, 'users.db');

  beforeAll(async () => {
    // Inicializa base de datos
    db = await initDB();
  });

  afterAll(async () => {
    if (db) await db.close();
    // Limpiar DB después de test
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('should create the database file', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should create the users table', async () => {
    const result = await db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles';`);
    expect(result.length).toBe(1);
  });
});
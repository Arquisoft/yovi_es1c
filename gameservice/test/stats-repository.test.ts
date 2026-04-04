import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { StatsRepository } from '../src/repositories/StatsRepository';

async function buildTestDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      board_size INTEGER NOT NULL,
      difficulty TEXT NOT NULL,
      status TEXT DEFAULT 'ONGOING',
      winner TEXT,
      mode TEXT DEFAULT 'BOT',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

async function insertMatch(
  db: Database,
  userId: number,
  opts: { status?: string; winner?: string; mode?: string; created_at?: string }
) {
  await db.run(
    `INSERT INTO matches (user_id, board_size, difficulty, status, winner, mode, created_at)
     VALUES (?, 11, 'easy', ?, ?, ?, ?)`,
    [
      userId,
      opts.status ?? 'FINISHED',
      opts.winner ?? 'USER',
      opts.mode ?? 'BOT',
      opts.created_at ?? new Date().toISOString(),
    ]
  );
}

describe('StatsRepository.getMatchHistory', () => {
  let db: Database;
  let repo: StatsRepository;

  beforeEach(async () => {
    db = await buildTestDb();
    repo = new StatsRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('returns finished matches for a user ordered from newest to oldest', async () => {
    await insertMatch(db, 1, { created_at: '2026-01-01T10:00:00' });
    await insertMatch(db, 1, { created_at: '2026-01-03T10:00:00' });
    await insertMatch(db, 1, { created_at: '2026-01-02T10:00:00' });

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(3);
    expect(result[0].created_at).toBe('2026-01-03T10:00:00');
    expect(result[1].created_at).toBe('2026-01-02T10:00:00');
    expect(result[2].created_at).toBe('2026-01-01T10:00:00');
  });

  it('returns at most `limit` matches', async () => {
    for (let i = 0; i < 15; i++) {
      await insertMatch(db, 1, {});
    }

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(10);
  });

  it('returns an empty array when the user has no finished matches', async () => {
    const result = await repo.getMatchHistory(999, 10);

    expect(result).toEqual([]);
  });

  it('does not include ONGOING matches', async () => {
    await insertMatch(db, 1, { status: 'FINISHED', winner: 'USER' });
    await insertMatch(db, 1, { status: 'ONGOING', winner: null });

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('FINISHED');
  });

  it('does not include matches from other users', async () => {
    await insertMatch(db, 1, {});
    await insertMatch(db, 2, {});

    const result = await repo.getMatchHistory(1, 10);

    expect(result).toHaveLength(1);
  });

  it('returns all expected fields on each row', async () => {
    await insertMatch(db, 1, { winner: 'BOT', mode: 'LOCAL_2P' });

    const [row] = await repo.getMatchHistory(1, 10);

    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('board_size');
    expect(row).toHaveProperty('difficulty');
    expect(row).toHaveProperty('status', 'FINISHED');
    expect(row).toHaveProperty('winner', 'BOT');
    expect(row).toHaveProperty('mode', 'LOCAL_2P');
    expect(row).toHaveProperty('created_at');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';

// Mock sqlite and sqlite3 before imports
vi.mock('sqlite3', () => ({
  default: { Database: vi.fn() },
}));

vi.mock('sqlite', () => ({
  open: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { open } from 'sqlite';
import { initDB } from '../src/database/database.js';

describe('initDB', () => {
  let mockDb: { exec: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = { exec: vi.fn().mockResolvedValue(undefined) };
    vi.mocked(open).mockResolvedValue(mockDb as any);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('CREATE TABLE IF NOT EXISTS user_profiles (...);');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the data directory if it does not exist', async () => {
    await initDB();

    expect(fs.mkdirSync).toHaveBeenCalledWith('/app/data', { recursive: true });
  });

  it('should open the database at the correct path', async () => {
    await initDB();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: expect.stringContaining('users.db'),
      })
    );
  });

  it('should throw an error if the schema file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(initDB()).rejects.toThrow('Schema file not found at');
  });

  it('should read and execute the schema file', async () => {
    const mockSchema = 'CREATE TABLE IF NOT EXISTS user_profiles (...);';
    vi.mocked(fs.readFileSync).mockReturnValue(mockSchema);

    await initDB();

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('users.sql'), 'utf-8');
    expect(mockDb.exec).toHaveBeenCalledWith(mockSchema);
  });

  it('should return the database instance', async () => {
    const db = await initDB();

    expect(db).toBe(mockDb);
  });

  it('should propagate errors from open()', async () => {
    vi.mocked(open).mockRejectedValue(new Error('Failed to open database'));

    await expect(initDB()).rejects.toThrow('Failed to open database');
  });

  it('should propagate errors from db.exec()', async () => {
    mockDb.exec.mockRejectedValue(new Error('SQL syntax error'));

    await expect(initDB()).rejects.toThrow('SQL syntax error');
  });
});
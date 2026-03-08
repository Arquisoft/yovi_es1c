import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Override the hardcoded /app/data path by mocking only mkdirSync and the db path
// while letting the real database.ts code execute

describe('initDB integration', () => {
  const tmpDir = path.join(os.tmpdir(), `db-integration-${Date.now()}`);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should execute real database.ts code and create the schema', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    // Partially mock fs so initDB writes to tmpDir instead of /app/data
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        mkdirSync: vi.fn(), // prevent writing to /app/data
      };
    });

    vi.doMock('sqlite', async () => {
      const actual = await import('sqlite');
      return {
        open: async (opts: any) => {
          // Redirect db file to tmpDir
          return actual.open({
            ...opts,
            filename: path.join(tmpDir, 'users.db'),
          });
        },
      };
    });

    // Import AFTER mocks so real database.ts code runs with our overrides
    const { initDB } = await import('../src/database/database.js');
    const db = await initDB();

    const result = await (db as any).get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'"
    );
    expect(result).toBeDefined();
    expect(result.name).toBe('user_profiles');

    await (db as any).close();
  });

  it('should return a db instance from real database.ts', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, mkdirSync: vi.fn() };
    });

    vi.doMock('sqlite', async () => {
      const actual = await import('sqlite');
      return {
        open: async (opts: any) =>
          actual.open({ ...opts, filename: path.join(tmpDir, 'users2.db') }),
      };
    });

    const { initDB } = await import('../src/database/database.js');
    const db = await initDB();

    expect(db).toBeDefined();
    expect(typeof (db as any).get).toBe('function');
    expect(typeof (db as any).run).toBe('function');

    await (db as any).close();
  });
});
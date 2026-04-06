import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('initDB integration', () => {
  const tmpRoot = path.join(os.tmpdir(), `users-db-tests-${Date.now()}`);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('node:fs');
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('can be called twice on the same file without resetting data', async () => {
    const dataDir = path.join(tmpRoot, 'persist');
    vi.stubEnv('DB_DATA_DIR', dataDir);

    const { initDB } = await import('../src/database/database.js');
    const firstDb = await initDB();
    await firstDb.run("INSERT INTO user_profiles (username, avatar) VALUES ('alice', 'avatar-a')");
    await firstDb.close();

    const secondDb = await initDB();
    const rows = await secondDb.all("SELECT username FROM user_profiles ORDER BY username ASC");
    expect(rows).toEqual([{ username: 'alice' }]);
    await secondDb.close();
  });

  it('preserves users after re-initialization (simulating restart)', async () => {
    const dataDir = path.join(tmpRoot, 'restart');
    vi.stubEnv('DB_DATA_DIR', dataDir);

    const { initDB } = await import('../src/database/database.js');
    const db = await initDB();
    await db.run("INSERT INTO user_profiles (username, avatar) VALUES ('bob', 'avatar-b')");
    await db.close();

    const restarted = await initDB();
    const bob = await restarted.get("SELECT username, avatar FROM user_profiles WHERE username = 'bob'");
    expect(bob).toEqual({ username: 'bob', avatar: 'avatar-b' });
    await restarted.close();
  });

  it('fails with a clear error when data directory is not writable', async () => {
    const dataDir = path.join(tmpRoot, 'readonly');
    vi.stubEnv('DB_DATA_DIR', dataDir);

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        accessSync: () => {
          throw new Error('EACCES: permission denied');
        },
      };
    });

    const { initDB } = await import('../src/database/database.js');
    await expect(initDB()).rejects.toThrow(`Data directory is not writable: ${dataDir}`);
  });

  it('schema avoids destructive startup statements', async () => {
    const schemaPath = path.join(process.cwd(), 'src/database/users.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8').toUpperCase();

    expect(schema).toContain('CREATE TABLE IF NOT EXISTS');
    expect(schema).not.toContain('DROP TABLE');
    expect(schema).not.toContain('DELETE FROM');
  });
});
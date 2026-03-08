import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('app.ts integration', () => {
  const tmpDir = path.join(os.tmpdir(), `app-integration-${Date.now()}`);

  afterEach(async () => {
    vi.resetModules();
    // Small delay to let SQLite release file handles on Windows before deleting
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Windows may still have the file locked, ignore cleanup error
      }
    }
  });

  it('should execute real app.ts code — initDB is called and express is set up', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return { ...actual, mkdirSync: vi.fn() };
    });

    vi.doMock('sqlite', async () => {
      const actual = await import('sqlite');
      return {
        open: async (opts: any) =>
          actual.open({ ...opts, filename: path.join(tmpDir, 'app.db') }),
      };
    });

    // Import real app.ts — executes its top-level code (initDB + express setup)
    await import('../src/app.js');
  });
});
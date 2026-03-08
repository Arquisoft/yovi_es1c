import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock initDB before importing app
vi.mock('../src/database/database', () => ({
  initDB: vi.fn().mockResolvedValue({
    exec: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { initDB } from '../src/database/database.js';

describe('app.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Database initialization', () => {
    it('should call initDB on startup', async () => {
      await import('../src/app.js');

      expect(initDB).toHaveBeenCalledTimes(1);
    });

    it('should call initDB only once', async () => {
      await import('../src/app.js');

      expect(initDB).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling', () => {
    it('should handle initDB failure gracefully', async () => {
      vi.mocked(initDB).mockRejectedValueOnce(new Error('DB init failed'));

      await expect(import('../src/app.js')).rejects.toThrow('DB init failed');
    });
  });
});

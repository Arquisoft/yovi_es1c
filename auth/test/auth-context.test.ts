import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('auth-context', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    delete process.env.AUTH_DB_PATH;
    delete process.env.JWT_SECRET;
  });

  it('getAuthDbPath trims the configured path', async () => {
    process.env.AUTH_DB_PATH = '  /tmp/auth.db  ';

    const context = await import('../src/bootstrap/auth-context.js');

    expect(context.getAuthDbPath()).toBe('/tmp/auth.db');
  });

  it('initializeAuthContext loads active refresh token metrics and exposes auth service', async () => {
    process.env.JWT_SECRET = 'context-secret';

    const initAuthDatabase = vi.fn().mockResolvedValue(undefined);
    const countActiveRefreshTokens = vi.fn().mockResolvedValue(7);
    const setActiveRefreshTokens = vi.fn();

    class MockCredentialsRepository {
      countActiveRefreshTokens = countActiveRefreshTokens;
    }

    vi.doMock('../src/db/init-auth-db.js', () => ({
      initAuthDatabase,
    }));
    vi.doMock('../src/repositories/credentials.repository.js', () => ({
      CredentialsRepository: MockCredentialsRepository,
    }));
    vi.doMock('../src/metrics.js', () => ({
      setActiveRefreshTokens,
    }));

    const context = await import('../src/bootstrap/auth-context.js');
    await context.initializeAuthContext();

    expect(initAuthDatabase).toHaveBeenCalledTimes(1);
    expect(countActiveRefreshTokens).toHaveBeenCalledTimes(1);
    expect(setActiveRefreshTokens).toHaveBeenCalledWith(7);
    expect(context.getAuthService()).toBeTruthy();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('extra coverage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('controller login success returns 200 json', async () => {
        const loginMock = vi.fn().mockResolvedValue({ ok: true });
        vi.doMock('../src/bootstrap/auth-context.js', () => ({
            getAuthService: () => ({ login: loginMock }),
        }));

        const { login } = await import('../src/controllers/auth.controller.js');
        const req = { body: { username: 'alice', password: 'password123' } } as any;
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const res = { status } as any;
        const next = vi.fn();

        await login(req, res, next);

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({ ok: true });
    });

    it('initAuthDatabase surfaces pg connection errors', async () => {
        vi.doMock('pg', () => ({
            default: {
                Client: class {
                    connect() { return Promise.reject(new Error('pg-connect-failed')); }
                    end()     { return Promise.resolve(); }
                    query()   { return Promise.resolve({ rows: [] }); }
                },
            },
        }));

        const { initAuthDatabase } = await import('../src/db/init-auth-db.js');
        await expect(initAuthDatabase()).rejects.toThrow('pg-connect-failed');
    });

    it('ensureInitialized caches initialization promise', async () => {
        vi.doMock('../src/bootstrap/auth-context.js', () => ({
            initializeAuthContext: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await import('../src/index.js');
        const first  = mod.ensureInitialized();
        const second = mod.ensureInitialized();

        expect(first).toBe(second);
        await first;
    });
});
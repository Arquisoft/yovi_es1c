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

    it('initAuthDatabase surfaces sqlite open errors', async () => {
        vi.doMock('sqlite3', () => ({
            default: {
                Database: class {
                    constructor(_path: string, callback: (err: Error) => void) {
                        callback(new Error('open-failed'));
                    }
                },
            },
        }));

        const { initAuthDatabase } = await import('../src/db/init-auth-db.js');
        await expect(initAuthDatabase('/tmp/whatever.db')).rejects.toThrow('open-failed');
    });

    it('ensureInitialized caches initialization promise', async () => {
        vi.doMock('../src/bootstrap/auth-context.js', () => ({
            initializeAuthContext: vi.fn().mockResolvedValue(undefined),
        }));

        const mod = await import('../src/index.js');
        const first = mod.ensureInitialized();
        const second = mod.ensureInitialized();

        expect(first).toBe(second);
        await first;
    });
});

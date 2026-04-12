import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'node:path';
import supertest from 'supertest';

vi.mock('pg', async () => {
    class MockClient {
        async connect() { return undefined; }
        async end()     { return undefined; }
        async query()   { return { rows: [], rowCount: 0 }; }
    }
    class MockPool {
        async query(sql: string) {
            if (/CREATE TABLE|CREATE INDEX/i.test(sql)) return { rows: [], rowCount: 0 };
            return { rows: [], rowCount: 0 };
        }
        async connect() {
            return {
                query: async (sql: string) => {
                    const s = sql.trim().toUpperCase();
                    if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [], rowCount: 0 };
                    return { rows: [], rowCount: 0 };
                },
                release: vi.fn(),
            };
        }
    }
    return { default: { Pool: MockPool, Client: MockClient } };
});

const indexPath = path.resolve(process.cwd(), 'src/index.ts');

describe('bootstrap/index/verify coverage', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
        delete process.env.JWT_SECRET;
    });

    it('getAuthService throws before init', async () => {
        const context = await import('../src/bootstrap/auth-context.js');
        expect(() => context.getAuthService()).toThrow('Auth context is not initialized');
    });

    it('initializeAuthContext requires JWT_SECRET', async () => {
        const context = await import('../src/bootstrap/auth-context.js');
        await expect(context.initializeAuthContext()).rejects.toThrow('JWT_SECRET is required to start Auth Service');
    });

    it('verify endpoint returns 401 when JWT_SECRET is missing', async () => {
        const { app } = await import('../src/index.js');
        const request = supertest(app);
        const res = await request.post('/api/auth/verify').send({ token: 'abc' });
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ valid: false });
    });

    it('startServer listens when initialized', async () => {
        process.env.JWT_SECRET = 'ok-secret';

        const { app, startServer } = await import('../src/index.js');
        const listenSpy = vi.spyOn(app, 'listen').mockImplementation(((_port: any, cb?: any) => {
            cb?.();
            return {} as any;
        }) as any);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        await startServer();

        expect(listenSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Auth Service running on port'));
    });

    it('direct run path handles startup failures', async () => {
        const previousArgv = [...process.argv];
        const exitSpy  = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        process.argv[1] = indexPath;
        await import('../src/index.js');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(errorSpy).toHaveBeenCalledWith('Auth Service failed to start:', expect.any(Error));
        expect(exitSpy).toHaveBeenCalledWith(1);

        process.argv = previousArgv;
    });
});
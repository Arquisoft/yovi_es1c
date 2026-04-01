import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialsRepository } from '../src/repositories/credentials.repository.js';
import sqlite3 from 'sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users_credentials (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    device_id  TEXT    NOT NULL,
    device_name TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    session_id TEXT    NOT NULL,
    token_hash TEXT    NOT NULL,
    family_id  TEXT    NOT NULL,
    expires_at TEXT    NOT NULL,
    revoked_at TEXT
);
`;

function buildInMemoryRepo(): { repo: CredentialsRepository; db: sqlite3.Database } {
    const db = new sqlite3.Database(':memory:');
    (db as any).serialize(() => {
        SCHEMA.split(';').filter(s => s.trim()).forEach(stmt => db.run(stmt + ';'));
    });
    const repo = new CredentialsRepository(':memory:');
    (repo as any).db = db;
    return { repo, db };
}

function buildBrokenRepo(): CredentialsRepository {
    const repo = new CredentialsRepository(':memory:');
    const fakeDb = {
        run: (_sql: string, _params: any, cb: Function) => cb(new Error('db error')),
        get: (_sql: string, _params: any, cb: Function) => cb(new Error('db error')),
        serialize: (fn: Function) => fn(),
    };
    (repo as any).db = fakeDb;
    return repo;
}


describe('CredentialsRepository – happy path', () => {
    let repo: CredentialsRepository;
    let db: sqlite3.Database;

    beforeEach(() => {
        ({ repo, db } = buildInMemoryRepo());
    });

    afterEach(() => new Promise<void>((resolve, reject) => {
        db.close(err => err ? reject(err) : resolve());
    }));

    it('createUser returns a numeric id', async () => {
        const id = await repo.createUser('alice', 'hash1');
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(0);
    });

    it('findUserByUsername returns the created user', async () => {
        await repo.createUser('alice', 'hash1');
        const user = await repo.findUserByUsername('alice');
        expect(user).not.toBeNull();
        expect(user!.username).toBe('alice');
        expect(user!.password_hash).toBe('hash1');
    });

    it('findUserByUsername returns null for unknown user', async () => {
        const user = await repo.findUserByUsername('nobody');
        expect(user).toBeNull();
    });

    it('findUserById returns the created user', async () => {
        const id = await repo.createUser('bob', 'hash2');
        const user = await repo.findUserById(id);
        expect(user).not.toBeNull();
        expect(user!.id).toBe(id);
        expect(user!.username).toBe('bob');
    });

    it('findUserById returns null for unknown id', async () => {
        const user = await repo.findUserById(9999);
        expect(user).toBeNull();
    });

    it('createSession then countActiveSessions returns 1', async () => {
        const uid = await repo.createUser('carol', 'hash3');
        await repo.createSession('sess-1', uid, 'dev-1', 'My Phone');
        const count = await repo.countActiveSessions(uid);
        expect(count).toBe(1);
    });

    it('countActiveSessions returns 0 for new user', async () => {
        const uid = await repo.createUser('dave', 'hash4');
        const count = await repo.countActiveSessions(uid);
        expect(count).toBe(0);
    });

    it('storeRefreshToken then findRefreshTokenByHash returns the record', async () => {
        const uid = await repo.createUser('eve', 'hash5');
        await repo.createSession('sess-2', uid, 'dev-2');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-2', 'hash-abc', 'fam-1', expiresAt);
        const record = await repo.findRefreshTokenByHash('hash-abc');
        expect(record).not.toBeNull();
        expect(record!.user_id).toBe(uid);
        expect(record!.family_id).toBe('fam-1');
        expect(record!.revoked_at).toBeNull();
    });

    it('findRefreshTokenByHash returns null for unknown hash', async () => {
        const record = await repo.findRefreshTokenByHash('nonexistent');
        expect(record).toBeNull();
    });

    it('revokeRefreshToken sets revoked_at and returns 1', async () => {
        const uid = await repo.createUser('frank', 'hash6');
        await repo.createSession('sess-3', uid, 'dev-3');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-3', 'hash-def', 'fam-2', expiresAt);
        const record = await repo.findRefreshTokenByHash('hash-def');
        const changes = await repo.revokeRefreshToken(record!.id);
        expect(changes).toBe(1);
        const after = await repo.findRefreshTokenByHash('hash-def');
        expect(after!.revoked_at).not.toBeNull();
    });

    it('revokeRefreshToken returns 0 for already-revoked token', async () => {
        const uid = await repo.createUser('frank2', 'hash6b');
        await repo.createSession('sess-3b', uid, 'dev-3b');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-3b', 'hash-defb', 'fam-2b', expiresAt);
        const record = await repo.findRefreshTokenByHash('hash-defb');
        await repo.revokeRefreshToken(record!.id);
        const changes = await repo.revokeRefreshToken(record!.id);
        expect(changes).toBe(0);
    });

    it('revokeRefreshTokenFamily revokes all tokens in the family', async () => {
        const uid = await repo.createUser('grace', 'hash7');
        await repo.createSession('sess-4', uid, 'dev-4');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-4', 'hash-1', 'fam-3', expiresAt);
        await repo.storeRefreshToken(uid, 'sess-4', 'hash-2', 'fam-3', expiresAt);
        const changes = await repo.revokeRefreshTokenFamily('fam-3');
        expect(changes).toBe(2);
    });

    it('revokeAllUserSessions revokes sessions and tokens', async () => {
        const uid = await repo.createUser('henry', 'hash8');
        await repo.createSession('sess-5', uid, 'dev-5');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-5', 'hash-xxx', 'fam-4', expiresAt);
        await repo.revokeAllUserSessions(uid);
        const count = await repo.countActiveSessions(uid);
        expect(count).toBe(0);
    });

    it('revokeSessionById revokes only the target session', async () => {
        const uid = await repo.createUser('ivan', 'hash9');
        await repo.createSession('sess-6', uid, 'dev-6');
        await repo.createSession('sess-7', uid, 'dev-7');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-6', 'hash-yyy', 'fam-5', expiresAt);
        await repo.revokeSessionById('sess-6');
        const count = await repo.countActiveSessions(uid);
        expect(count).toBe(1);
    });

    it('revokeOldestActiveSession revokes the oldest session', async () => {
        const uid = await repo.createUser('judy', 'hash10');
        await repo.createSession('sess-old', uid, 'dev-old');
        await repo.createSession('sess-new', uid, 'dev-new');
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-old', 'hash-old', 'fam-old', expiresAt);
        await repo.revokeOldestActiveSession(uid);
        const count = await repo.countActiveSessions(uid);
        expect(count).toBe(1);
    });

    it('revokeOldestActiveSession returns 0 when no active sessions', async () => {
        const uid = await repo.createUser('kate', 'hash11');
        const changes = await repo.revokeOldestActiveSession(uid);
        expect(changes).toBe(0);
    });

    it('countActiveRefreshTokens does not count expired tokens', async () => {
        const uid = await repo.createUser('leo', 'hash12');
        await repo.createSession('sess-8', uid, 'dev-8');
        const future = new Date(Date.now() + 60_000).toISOString();
        const past   = new Date(Date.now() - 60_000).toISOString();
        await repo.storeRefreshToken(uid, 'sess-8', 'hash-active',  'fam-6', future);
        await repo.storeRefreshToken(uid, 'sess-8', 'hash-expired', 'fam-7', past);
        const count = await repo.countActiveRefreshTokens();
        expect(count).toBeGreaterThanOrEqual(1);
    });
});



describe('CredentialsRepository – DB error paths', () => {
    it('createUser rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.createUser('x', 'h')).rejects.toThrow('db error');
    });

    it('findUserByUsername rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.findUserByUsername('x')).rejects.toThrow('db error');
    });

    it('findUserById rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.findUserById(1)).rejects.toThrow('db error');
    });

    it('createSession rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.createSession('s', 1, 'd')).rejects.toThrow('db error');
    });

    it('countActiveSessions rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.countActiveSessions(1)).rejects.toThrow('db error');
    });

    it('storeRefreshToken rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(
            repo.storeRefreshToken(1, 's', 'h', 'f', new Date().toISOString())
        ).rejects.toThrow('db error');
    });

    it('findRefreshTokenByHash rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.findRefreshTokenByHash('h')).rejects.toThrow('db error');
    });

    it('revokeRefreshToken rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.revokeRefreshToken(1)).rejects.toThrow('db error');
    });

    it('revokeRefreshTokenFamily rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.revokeRefreshTokenFamily('f')).rejects.toThrow('db error');
    });

    it('revokeAllUserSessions rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.revokeAllUserSessions(1)).rejects.toThrow('db error');
    });

    it('revokeSessionById rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.revokeSessionById('s')).rejects.toThrow('db error');
    });

    it('countActiveRefreshTokens rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.countActiveRefreshTokens()).rejects.toThrow('db error');
    });

    it('revokeOldestActiveSession rejects on DB error', async () => {
        const repo = buildBrokenRepo();
        await expect(repo.revokeOldestActiveSession(1)).rejects.toThrow('db error');
    });
});
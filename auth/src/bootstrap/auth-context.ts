import { AuthService } from '../services/auth.service.js';
import { CredentialsRepository } from '../repositories/credentials.repository.js';
import { initAuthDatabase } from '../db/init-auth-db.js';

const DEFAULT_AUTH_DB_PATH = '/app/data/auth.db';

let authService: AuthService | null = null;

export function getAuthDbPath(): string {
    return process.env.AUTH_DB_PATH?.trim() || DEFAULT_AUTH_DB_PATH;
}

export async function initializeAuthContext(): Promise<void> {
    const jwtSecret = process.env.JWT_SECRET?.trim();

    if (!jwtSecret) {
        throw new Error('JWT_SECRET is required to start Auth Service');
    }

    const dbPath = getAuthDbPath();
    await initAuthDatabase(dbPath);

    authService = new AuthService(new CredentialsRepository(dbPath));
}

export function getAuthService(): AuthService {
    if (!authService) {
        throw new Error('Auth context is not initialized');
    }

    return authService;
}

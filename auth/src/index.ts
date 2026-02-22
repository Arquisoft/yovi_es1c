import { fileURLToPath } from 'node:url';
import { app } from './app.js';
import { initializeAuthContext } from './bootstrap/auth-context.js';

const PORT = Number(process.env.PORT ?? 3001);

let initPromise: Promise<void> | null = null;

export function ensureInitialized(): Promise<void> {
    return (initPromise ??= initializeAuthContext());
}

export async function startServer(): Promise<void> {
    await ensureInitialized();

    app.listen(PORT, () => {
        console.log(`Auth Service running on port ${PORT}`);
    });
}

export { app };

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
    startServer().catch((error) => {
        console.error('Auth Service failed to start:', error);
        process.exit(1);
    });
}
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './routes/auth.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { initializeAuthContext } from './bootstrap/auth-context.js';

const PORT = process.env.PORT || 3001;

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

let initPromise: Promise<void> | null = null;

export function ensureInitialized(): Promise<void> {
    if (!initPromise) {
        initPromise = initializeAuthContext();
    }

    return initPromise;
}

export async function startServer(): Promise<void> {
    await ensureInitialized();

    app.listen(PORT, () => {
        console.log(`Auth Service running on port ${PORT}`);
    });
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
    startServer().catch((error) => {
        console.error('Auth Service failed to start:', error);
        process.exit(1);
    });
}

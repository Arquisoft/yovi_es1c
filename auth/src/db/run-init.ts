import { getAuthDbPath } from '../bootstrap/auth-context.js';
import { initAuthDatabase } from './init-auth-db.js';

initAuthDatabase(getAuthDbPath())
    .then(() => {
        console.log('Auth DB initialized');
    })
    .catch((error) => {
        console.error('Failed to initialize auth DB:', error);
        process.exit(1);
    });

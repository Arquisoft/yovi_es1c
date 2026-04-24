import type { NextFunction, Request, Response } from 'express';
import { AuthVerifyClient, AuthVerifyError } from '../services/AuthVerifyClient.js';

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            username?: string;
        }
    }
}




export async function verifyJwtMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' });
        }

        const authServiceUrl = process.env.AUTH_SERVICE_URL;
        if (!authServiceUrl) {
            return res.status(503).json({
                error: 'auth_unavailable',
                message: 'Authentication service unavailable',
                reason: 'AUTH_UNAVAILABLE',
            });
        }

        const claims = await getVerifyClient(authServiceUrl).verifyAuthorizationHeader(authHeader);
        if (!claims?.sub) {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid token claims' });
        }

        req.userId = claims.sub;
        req.username = claims.username;
        next();
    } catch (error) {
        console.error('Auth service communication error:', error);
        const reason = error instanceof AuthVerifyError ? error.code : 'AUTH_UNAVAILABLE';
        return res.status(503).json({
            error: 'auth_unavailable',
            message: 'Authentication service unavailable',
            reason,
        });
    }
}

let verifyClient: AuthVerifyClient | null = null;
let verifyClientUrl: string | null = null;

function getVerifyClient(authServiceUrl: string): AuthVerifyClient {
    if (!verifyClient || verifyClientUrl !== authServiceUrl) {
        verifyClient = new AuthVerifyClient(authServiceUrl);
        verifyClientUrl = authServiceUrl;
    }
    return verifyClient;
}

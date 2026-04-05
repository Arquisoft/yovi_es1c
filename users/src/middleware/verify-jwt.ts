import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            username?: string;
        }
    }
}

export function verifyJwtMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization?.trim();
    const bearerMatch = authHeader?.match(/^Bearer (\S+)$/i);
    const token = bearerMatch?.[1];

    if (!token) {
        return res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid authorization header' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        return res.status(500).json({ error: 'server_error', message: 'JWT secret not configured' });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;

        if (!userId || decoded.tokenType !== 'access') {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid token claims' });
        }

        req.userId = userId;
        req.username = decoded.username;
        next();
    } catch {
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
}

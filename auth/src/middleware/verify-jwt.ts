import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { recordTokenVerification, recordVerifyAttempt, startJwtVerifyTimer } from '../metrics.js';

const UNAUTHORIZED_RESPONSE = { valid: false };

function extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization?.trim();
    const bearerMatch = authHeader?.match(/^Bearer (\S+)$/i);

    if (bearerMatch?.[1]) {
        return bearerMatch[1];
    }

    if (typeof req.body?.token === 'string' && req.body.token.trim().length > 0) {
        return req.body.token.trim();
    }

    return undefined;
}

export function verifyToken(req: Request, res: Response) {
    const token = extractToken(req);

    if (!token) {
        recordVerifyAttempt('missing_token');
        recordTokenVerification('invalid');
        return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        recordVerifyAttempt('missing_secret');
        recordTokenVerification('invalid');
        return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    const endVerify = startJwtVerifyTimer();

    try {
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;
        const tokenType = decoded.tokenType;

        if (!userId || tokenType !== 'access') {
            recordVerifyAttempt('wrong_token_type');
            recordTokenVerification('invalid');
            return res.status(401).json(UNAUTHORIZED_RESPONSE);
        }

        recordVerifyAttempt('success');
        recordTokenVerification('valid');

        return res.status(200).json({
            valid: true,
            claims: {
                sub: userId,
                username: decoded.username,
                tokenType,
                iat: decoded.iat,
                exp: decoded.exp,
            },
        });
    } catch (error) {
        const isExpired = error instanceof jwt.TokenExpiredError;

        recordVerifyAttempt('invalid_token');
        recordTokenVerification(isExpired ? 'expired' : 'invalid');
        return res.status(401).json(UNAUTHORIZED_RESPONSE);
    } finally {
        endVerify();
    }
}
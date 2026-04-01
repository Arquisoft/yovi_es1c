import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { parseAuthBody, parseLogoutBody, parseRefreshBody } from '../validation/auth.schemas.js';
import { getAuthService } from '../bootstrap/auth-context.js';
import { BadCredentialsError, InvalidInputError } from '../errors/domain-errors.js';
import { recordLoginAttempt, recordRefreshAttempt, recordRegisterAttempt } from '../metrics.js';

export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password, deviceId, deviceName } = parseAuthBody(req.body);
        const result = await getAuthService().register(username, password, deviceId, deviceName);
        return res.status(201).json(result);
    } catch (error) {
        if (error instanceof InvalidInputError) {
            recordRegisterAttempt('invalid_input');
        }

        return next(error);
    }
}

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password, deviceId, deviceName } = parseAuthBody(req.body);
        const result = await getAuthService().login(username, password, deviceId, deviceName);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof InvalidInputError) {
            recordLoginAttempt('invalid_input');
        }

        return next(error);
    }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        const { refreshToken } = parseRefreshBody(req.body);
        const result = await getAuthService().refresh(refreshToken);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof InvalidInputError) {
            recordRefreshAttempt('invalid_input');
        }

        return next(error);
    }
}

function extractClaimsFromAccessToken(req: Request): { sessionId: string; userId: number } {
    const authHeader = req.headers.authorization?.trim();
    const bearerMatch = authHeader?.match(/^Bearer (\S+)$/i);
    const token = bearerMatch?.[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !jwtSecret) {
        throw new BadCredentialsError();
    }

    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const tokenType = decoded.tokenType;
    const sessionId = typeof decoded.sid === 'string' ? decoded.sid : '';
    const userId = Number(decoded.sub);

    if (tokenType !== 'access' || !sessionId || !Number.isFinite(userId)) {
        throw new BadCredentialsError();
    }

    return { sessionId, userId };
}

export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        const parsed = parseLogoutBody(req.body);
        const { sessionId: tokenSessionId } = extractClaimsFromAccessToken(req);
        await getAuthService().logout(parsed.sessionId ?? tokenSessionId);
        return res.status(204).send();
    } catch (error) {
        if (error instanceof InvalidInputError) {
            recordLoginAttempt('invalid_input');
        }

        return next(error);
    }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
        const { userId } = extractClaimsFromAccessToken(req);
        await getAuthService().logoutAll(userId);
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
}

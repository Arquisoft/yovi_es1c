import type { NextFunction, Request, Response } from 'express';
import { parseAuthBody, parseRefreshBody } from '../validation/auth.schemas.js';
import { getAuthService } from '../bootstrap/auth-context.js';

export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password } = parseAuthBody(req.body);
        const result = await getAuthService().register(username, password);
        return res.status(201).json(result);
    } catch (error) {
        return next(error);
    }
}

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password } = parseAuthBody(req.body);
        const result = await getAuthService().login(username, password);
        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        const { refreshToken } = parseRefreshBody(req.body);
        const result = await getAuthService().refresh(refreshToken);
        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

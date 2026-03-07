import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/http-error.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof HttpError) {
        return res.status(err.statusCode).json({
            error: err.error,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
        });
    }

    console.error('Unhandled game service error:', err);
    return res.status(500).json({
        error: 'unexpected_error',
        message: 'Unexpected server error',
    });
}

import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors/http-error.js';
import { recordAuthError } from '../metrics.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            error: 'invalid_json',
            message: 'Request body contains invalid JSON',
        });
    }
    if (err instanceof HttpError) {
        recordAuthError(err.error);

        return res.status(err.statusCode).json({
            error: err.error,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
        });
    }

    recordAuthError('unexpected_error');
    console.error('Unhandled auth error:', err);

    return res.status(500).json({
        error: 'unexpected_error',
        message: 'Unexpected server error',
    });
}
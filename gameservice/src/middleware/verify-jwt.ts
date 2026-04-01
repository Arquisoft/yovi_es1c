import type { NextFunction, Request, Response } from 'express';
import { AuthVerifyClient, AuthVerifyError } from '../services/AuthVerifyClient';
import { apiError } from '../errors/error-catalog';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      username?: string;
    }
  }
}

export async function verifyJwtMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json(apiError('UNAUTHORIZED', 'Missing authorization header'));
    }

    const authServiceUrl = process.env.AUTH_SERVICE_URL;
    if (!authServiceUrl) {
      return res.status(503).json(apiError('AUTH_UNAVAILABLE', 'Auth service URL not configured'));
    }
    const claims = getVerifyClient(authServiceUrl).verifyAuthorizationHeader(authHeader);
    const resolvedClaims = await claims;

    if (!resolvedClaims?.sub) {
      return res.status(401).json(apiError('INVALID_TOKEN', 'Invalid token claims'));
    }
    
    req.userId = resolvedClaims.sub;
    req.username = resolvedClaims.username;

    next();
  } catch (error) {
    console.error('Auth service communication error:', error);
    if (error instanceof AuthVerifyError) {
      return res.status(503).json(apiError('AUTH_UNAVAILABLE', 'Authentication service unavailable', { reason: error.code }));
    }
    return res.status(503).json(apiError('AUTH_UNAVAILABLE', 'Authentication service unavailable'));
  }
}

let verifyClient: AuthVerifyClient | null = null;

function getVerifyClient(authServiceUrl: string): AuthVerifyClient {
  if (!verifyClient) {
    verifyClient = new AuthVerifyClient(authServiceUrl);
  }
  return verifyClient;
}

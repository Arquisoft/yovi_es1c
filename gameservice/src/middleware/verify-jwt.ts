import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to include userId set by JWT auth middleware
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

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

export function verifyJwtMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided', valid: false });
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured', valid: false });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;
    const tokenType = decoded.tokenType;

    if (!userId || tokenType !== 'access') {
      return res.status(401).json({ error: 'Invalid token', valid: false });
    }

    // Adjuntar userId al request para usarlo en los controladores
    req.userId = userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token', valid: false });
  }
}

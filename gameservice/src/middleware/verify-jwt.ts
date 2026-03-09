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

export async function verifyJwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const response = await fetch(`${process.env.AUTH_SERVICE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return res.status(401).json({ valid: false });
    }

    const data = await response.json();

    if (!data.valid) {
      return res.status(401).json({ valid: false });
    }

    req.userId = data.claims.sub;

    next();
  } catch {
    return res.status(401).json({ valid: false });
  }
}

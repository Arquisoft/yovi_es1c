import type { NextFunction, Request, Response } from 'express';

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
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const authServiceUrl = process.env.AUTH_SERVICE_URL;
    if (!authServiceUrl) {
      return res.status(500).json({ error: 'Auth service URL not configured' });
    }

    const response = await fetch(`${authServiceUrl}/api/auth/verify`, {
      method: 'POST',
      headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const data = await response.json();

    if (!data.valid || !data.claims?.sub) {
      return res.status(401).json({ error: 'Invalid token claims' });
    }
    
    req.userId = data.claims.sub;
    req.username = data.claims.username;

    next();
  } catch (error) {
    console.error('Auth service communication error:', error);
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }
}
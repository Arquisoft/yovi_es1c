import type {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

export async function verifyToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    try {
        const token = authHeader.substring(7);
        const JWT_SECRET = process.env.JWT_SECRET;

        if (!JWT_SECRET) {
            return res.status(500).json({ error: 'JWT_SECRET not configured' });
        }

        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };

        return res.status(200).json({
            userId: decoded.userId,
            username: decoded.username
        });

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

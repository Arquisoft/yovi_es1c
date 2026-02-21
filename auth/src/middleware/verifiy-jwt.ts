import type {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

const UNAUTHORIZED_RESPONSE = { error: 'Unauthorized' };

export function verifyToken(req: Request, res: Response) {
    const authHeader = req.headers.authorization?.trim();

    const bearerMatch = authHeader?.match(/^Bearer (\S+)$/i);
    const token = bearerMatch?.[1];

    if (!token) {
        return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    try {
        const JWT_SECRET = process.env.JWT_SECRET;

        if (!JWT_SECRET) {
            return res.status(401).json(UNAUTHORIZED_RESPONSE);
        }

        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;

        if (!userId) {
            return res.status(401).json(UNAUTHORIZED_RESPONSE);
        }

        return res.status(200).json({
            userId
        });

    } catch {
        return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }
}

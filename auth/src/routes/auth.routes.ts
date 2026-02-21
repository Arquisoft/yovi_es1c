import { Router } from 'express';
import { verifyToken } from '../middleware/verify-jwt.js';

const router = Router();

router.post('/verify', verifyToken);

export { router as authRoutes };

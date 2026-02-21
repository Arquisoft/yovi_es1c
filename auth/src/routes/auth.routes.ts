import { Router } from 'express';
import { verifyToken } from '../middleware/verifiy-jwt.js';

const router = Router();

router.post('/verify', verifyToken);

export { router as authRoutes };

import { Router } from 'express';
import { verifyToken } from '../middleware/verify-jwt.js';
import { login, refresh, register } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/verify', verifyToken);

export { router as authRoutes };

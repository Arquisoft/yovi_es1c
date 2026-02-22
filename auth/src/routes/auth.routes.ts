import { Router } from 'express';
import { verifyToken } from '../middleware/verify-jwt.js';
import { login, register } from '../controllers/auth.controller.js';

const router = Router();

router.post('/verify', verifyToken);
router.post('/register', register);
router.post('/login', login);

export { router as authRoutes };
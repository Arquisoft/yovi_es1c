import { Router, type RequestHandler } from 'express';
import { verifyToken } from '../middleware/verify-jwt.js';
import { login, logout, logoutAll, refresh, register } from '../controllers/auth.controller.js';
import { startAuthHttpRequestTimer, type AuthRoute } from '../metrics.js';

const router = Router();

function withRouteMetrics(route: AuthRoute, handler: RequestHandler): RequestHandler {
    return (req, res, next) => {
        const stopTimer = startAuthHttpRequestTimer(req.method, route);

        res.once('finish', () => {
            stopTimer(res.statusCode);
        });

        void Promise.resolve(handler(req, res, next)).catch(next);
    };
}

router.post('/register', withRouteMetrics('/api/auth/register', register));
router.post('/login', withRouteMetrics('/api/auth/login', login));
router.post('/refresh', withRouteMetrics('/api/auth/refresh', refresh));
router.post('/logout', withRouteMetrics('/api/auth/logout', logout));
router.post('/logout-all', withRouteMetrics('/api/auth/logout-all', logoutAll));
router.post('/verify', withRouteMetrics('/api/auth/verify', verifyToken));

export { router as authRoutes };

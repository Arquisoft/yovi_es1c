import { Router } from 'express';
import { UsersController } from '../controllers/users.controller.js';
import { verifyJwtMiddleware } from '../middleware/verify-jwt.js';

export function createUsersRouter(controller: UsersController): Router {
    const router = Router();

    router.use('/profiles', verifyJwtMiddleware);

    router.post('/profiles', controller.createProfile.bind(controller));
    router.get('/profiles/by-username/:username', controller.getProfileByUsername.bind(controller));
    router.get('/profiles/:id', controller.getProfile.bind(controller));
    router.put('/profiles/:id', controller.updateProfile.bind(controller));

    return router;
}

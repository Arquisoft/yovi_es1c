import { Router } from 'express';
import { UsersController } from '../controllers/users.controller.js';

export function createUsersRouter(controller: UsersController): Router {
    const router = Router();

    router.post('/profiles', controller.createProfile.bind(controller));
    router.get('/profiles/by-username/:username', controller.getProfileByUsername.bind(controller));
    router.get('/profiles/:id', controller.getProfile.bind(controller));
    router.put('/profiles/:id', controller.updateProfile.bind(controller));

    return router;
}

import { Router } from 'express';
import { UsersController } from '../controllers/users.controller.js';
import { verifyJwtMiddleware } from '../middleware/verify-jwt.js';

export function createUsersRouter(controller: UsersController): Router {
    const router = Router();


    router.post('/profiles', controller.createProfile.bind(controller));
    router.get('/profiles/by-username/:username', controller.getProfileByUsername.bind(controller));
    router.get('/profiles/:id', controller.getProfile.bind(controller));
    router.put('/profiles/:id', controller.updateProfile.bind(controller));
    router.get('/me', verifyJwtMiddleware, controller.getMyProfile.bind(controller));
    router.put('/me', verifyJwtMiddleware, controller.updateMyProfile.bind(controller));
    router.get('/friends', verifyJwtMiddleware, controller.listMyFriends.bind(controller));
    router.get('/friends/requests', verifyJwtMiddleware, controller.listMyFriendRequests.bind(controller));
    router.post('/friends/requests', verifyJwtMiddleware, controller.sendFriendRequest.bind(controller));
    router.post('/friends/requests/:requestId/accept', verifyJwtMiddleware, controller.acceptFriendRequest.bind(controller));
    router.delete('/friends/requests/:requestId', verifyJwtMiddleware, controller.deleteFriendRequest.bind(controller));
    router.delete('/friends/:friendUserId', verifyJwtMiddleware, controller.unfriend.bind(controller));

    return router;
}

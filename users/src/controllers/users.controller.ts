import { Request, Response } from 'express';
import { UsersService } from '../services/users.service.js';
import { UserRepository, UserProfile } from '../repositories/users.repository.js';
import { ALLOWED_AVATARS, DEFAULT_AVATAR } from '../config/avatar-options.js';
import { HttpError } from '../errors/http-error.js';

export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly userRepository: UserRepository
    ) {}

    private toProfileResponse(profile: UserProfile) {
        return {
            id: profile.user_id,
            user_id: profile.user_id,
            username: profile.username,
            displayName: profile.display_name ?? profile.username,
            display_name: profile.display_name,
            email: profile.email,
            avatar: profile.avatar,
            created_at: profile.created_at,
        };
    }

    private getAuthenticatedUserId(req: Request): number | null {
        const userId = Number(req.userId);
        return Number.isInteger(userId) && userId > 0 ? userId : null;
    }

    async createProfile(req: Request, res: Response): Promise<void> {
        const userId = Number(req.body?.userId ?? req.body?.user_id ?? req.body?.id);
        const username = String(req.body?.username ?? '').trim();
        const avatar = req.body?.avatar ?? DEFAULT_AVATAR;
        const authenticatedUserId = this.getAuthenticatedUserId(req);

        if (!Number.isInteger(userId) || userId <= 0 || !username) {
            res.status(400).json({ error: 'userId and username are required' });
            return;
        }

        if (authenticatedUserId !== null && authenticatedUserId !== userId) {
            res.status(403).json({ error: 'forbidden_profile_action', message: 'You cannot create a profile for another user' });
            return;
        }

        if (avatar !== undefined && avatar !== null && !ALLOWED_AVATARS.has(avatar)) {
            res.status(400).json({ error: 'Invalid avatar' });
            return;
        }

        try {
            const profile = await this.userRepository.createProfile(userId, username, avatar ?? DEFAULT_AVATAR);
            this.usersService.onUserCreated();
            res.status(201).json(this.toProfileResponse(profile));
        } catch (err: any) {
            if (err?.message?.includes('UNIQUE constraint failed')) {
                res.status(409).json({ error: 'Username already exists' });
            } else {
                console.error(err);
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    }

    async getProfile(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid id' });
            return;
        }
        const profile = await this.userRepository.getById(id);
        if (!profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        res.json(this.toProfileResponse(profile));
    }

    async getProfileByUsername(req: Request, res: Response): Promise<void> {
        const username = req.params['username'] as string;
        const profile = await this.userRepository.getByUsername(username);
        if (!profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        res.json(this.toProfileResponse(profile));
    }

    async getMyProfile(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);
        const username = req.username?.trim();

        if (!userId || !username) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const profile = await this.userRepository.ensureProfile(userId, username, DEFAULT_AVATAR);
            res.json(this.toProfileResponse(profile));
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    async updateMyProfile(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { displayName, email, avatar } = req.body;

        if (avatar !== undefined && avatar !== null && !ALLOWED_AVATARS.has(avatar)) {
            res.status(400).json({ error: 'Invalid avatar' });
            return;
        }

        try {
            const updated = await this.userRepository.updateProfile(userId, {
                displayName,
                email,
                avatar,
            });

            if (!updated) {
                res.status(404).json({ error: 'Profile not found' });
                return;
            }

            this.usersService.onProfileUpdated();
            res.json(this.toProfileResponse(updated));
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    async updateProfile(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid id' });
            return;
        }
        const { avatar } = req.body;

        if (avatar !== undefined && avatar !== null && !ALLOWED_AVATARS.has(avatar)) {
            res.status(400).json({ error: 'Invalid avatar' });
            return;
        }

        const updated = await this.userRepository.updateProfile(id, { avatar });
        if (!updated) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        this.usersService.onProfileUpdated();
        res.json(this.toProfileResponse(updated));
    }

    async listMyFriends(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const friends = await this.userRepository.listFriends(userId);
        res.json(
            friends.map(friend => ({
                id: friend.user_id,
                userId: friend.user_id,
                username: friend.username,
                displayName: friend.display_name,
                avatar: friend.avatar,
                friendsSince: friend.friendship_created_at,
            }))
        );
    }

    async listMyFriendRequests(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const requests = await this.userRepository.listPendingFriendRequests(userId);
        res.json(
            requests.map(request => ({
                id: request.id,
                status: request.status,
                createdAt: request.created_at,
                direction: request.direction,
                user: {
                    id: request.user.user_id,
                    userId: request.user.user_id,
                    username: request.user.username,
                    displayName: request.user.display_name,
                    avatar: request.user.avatar,
                },
            }))
        );
    }

    async sendFriendRequest(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);
        const recipientUsername = String(req.body?.username ?? '');

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        try {
            const request = await this.userRepository.createFriendRequest(userId, recipientUsername);

            res.status(201).json({
                id: request.id,
                status: request.status,
                createdAt: request.created_at,
                direction: request.direction,
                user: {
                    id: request.user.user_id,
                    userId: request.user.user_id,
                    username: request.user.username,
                    displayName: request.user.display_name,
                    avatar: request.user.avatar,
                },
            });
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    async acceptFriendRequest(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);
        const requestId = Number(req.params['requestId']);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!requestId) {
            res.status(400).json({ error: 'Invalid request id' });
            return;
        }

        try {
            const request = await this.userRepository.acceptFriendRequest(requestId, userId);

            res.json({
                id: request.id,
                status: request.status,
                createdAt: request.created_at,
                direction: request.direction,
                user: {
                    id: request.user.user_id,
                    userId: request.user.user_id,
                    username: request.user.username,
                    displayName: request.user.display_name,
                    avatar: request.user.avatar,
                },
            });
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    async deleteFriendRequest(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);
        const requestId = Number(req.params['requestId']);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!requestId) {
            res.status(400).json({ error: 'Invalid request id' });
            return;
        }

        try {
            await this.userRepository.deleteFriendRequest(requestId, userId);
            res.status(204).send();
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    async unfriend(req: Request, res: Response): Promise<void> {
        const userId = this.getAuthenticatedUserId(req);
        const friendUserId = Number(req.params['friendUserId']);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!friendUserId) {
            res.status(400).json({ error: 'Invalid friend user id' });
            return;
        }

        try {
            await this.userRepository.deleteFriendship(userId, friendUserId);
            res.status(204).send();
        } catch (error) {
            this.handleHttpError(res, error);
        }
    }

    recordCreatedUser(): void {
        this.usersService.onUserCreated();
    }

    recordUpdatedProfile(): void {
        this.usersService.onProfileUpdated();
    }

    recordDeletedUser(): void {
        this.usersService.onUserDeleted();
    }

    private handleHttpError(res: Response, error: unknown): void {
        if (error instanceof HttpError) {
            res.status(error.statusCode).json({ error: error.error, message: error.message });
            return;
        }

        console.error(error);
        res.status(500).json({ error: 'internal_server_error', message: 'Internal server error' });
    }
}

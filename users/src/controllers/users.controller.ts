import { Request, Response } from 'express';
import { UsersService } from '../services/users.service.js';
import { UserRepository } from '../repositories/users.repository.js';
import { ALLOWED_AVATARS, DEFAULT_AVATAR } from '../config/avatar-options.js';

export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly userRepository: UserRepository
    ) { }

    async createProfile(req: Request, res: Response): Promise<void> {
        const { userId, username, avatar } = req.body;
        if (!userId || !username) {
            res.status(400).json({ error: 'userId and username are required' });
            return;
        }
        if (avatar !== undefined && avatar !== null && !ALLOWED_AVATARS.has(avatar)) {
            res.status(400).json({ error: 'Invalid avatar' });
            return;
        }
        try {
            const profile = await this.userRepository.createProfile(userId, username, avatar ?? DEFAULT_AVATAR);
            this.usersService.onUserCreated();
            res.status(201).json(profile);
        } catch (err: any) {
            if (err?.message?.includes('UNIQUE constraint failed')) {
                res.status(409).json({ error: 'Username already exists' });
            } else {
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
        res.json(profile);
    }

    async getProfileByUsername(req: Request, res: Response): Promise<void> {
        const username = req.params['username'] as string;
        const profile = await this.userRepository.getByUsername(username);
        if (!profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        res.json(profile);
    }

    async getMyProfile(req: Request, res: Response): Promise<void> {
        const userId = Number((req as any).userId);

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const profile = await this.userRepository.getById(userId);

        if (!profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        res.json(profile);
    }

    async updateProfile(req: Request, res: Response): Promise<void> {
        const id = parseInt(req.params['id'] as string, 10);
        if (isNaN(id)) {
            res.status(400).json({ error: 'Invalid id' });
            return;
        }
        const { avatar } = req.body;
        const updated = await this.userRepository.updateProfile(id, { avatar });
        if (!updated) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        this.usersService.onProfileUpdated();
        res.json(updated);
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
}

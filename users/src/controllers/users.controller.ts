import type { NextFunction, Request, Response } from 'express';
import { UsersService } from '../services/users.service.js';
import { ValidationError } from '../errors/domain-errors.js';

export class UsersController {
    constructor(private readonly service: UsersService) {}

    async createProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const username = req.username;
            if (!username) {
                throw new ValidationError('username is required');
            }
            const { avatar } = req.body;
            const profile = await this.service.createProfile(username, avatar);
            return res.status(201).json(profile);
        } catch (err) {
            next(err);
        }
    }

    async getProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (isNaN(id)) {
                throw new ValidationError('id must be a number');
            }
            const profile = await this.service.getProfile(id);
            return res.status(200).json(profile);
        } catch (err) {
            next(err);
        }
    }

    async getProfileByUsername(req: Request, res: Response, next: NextFunction) {
        try {
            const username = String(req.params.username ?? '');
            if (username.trim().length === 0) {
                throw new ValidationError('username is required');
            }
            const profile = await this.service.getProfileByUsername(username.trim());
            return res.status(200).json(profile);
        } catch (err) {
            next(err);
        }
    }

    async updateProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (isNaN(id)) {
                throw new ValidationError('id must be a number');
            }
            const { avatar } = req.body;
            const profile = await this.service.updateProfile(id, { avatar });
            return res.status(200).json(profile);
        } catch (err) {
            next(err);
        }
    }
}

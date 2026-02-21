import type {Request, Response} from 'express';
import { AuthService } from '../services/auth.service.js';
import {CredentialsRepository} from "../repositories/credentials.repository.js";

const service = new AuthService(new CredentialsRepository('./data/auth.db'));

export async function register(req: Request, res: Response) {
    try {
        const { username, password } = req.body;
        const result = await service.register(username, password);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(409).json({ error: error.message });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { username, password } = req.body;
        const result = await service.login(username, password);
        res.json(result);
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
}

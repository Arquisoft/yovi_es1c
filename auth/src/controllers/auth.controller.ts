import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { CredentialsRepository } from '../repositories/credentials.repository.js';

let service: AuthService | null = null;
function getService() {
    if (!service) {
        const dbPath = process.env.AUTH_DB_PATH ?? './data/auth.db';
        service = new AuthService(new CredentialsRepository(dbPath));
    }
    return service;
}

export async function register(req: Request, res: Response) {
    try {
        const { username, password } = req.body;
        const result = await getService().register(username, password);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(409).json({ error: error.message });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { username, password } = req.body;
        const result = await getService().login(username, password);
        res.json(result);
    } catch (error: any) {
        res.status(401).json({ error: error.message });
    }
}
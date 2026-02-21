import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { CredentialsRepository } from '../repositories/credentials.repository.js';

export class AuthService {
    constructor(private repo: CredentialsRepository) {}

    async register(username: string, password: string): Promise<{ userId: number; token: string }> {
        const passwordHash = await bcrypt.hash(password, 12);
        const userId = await this.repo.createUser(username, passwordHash);

        const token = jwt.sign(
            { userId, username },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        return { userId, token };
    }

    async login(username: string, password: string): Promise<{ userId: number; token: string }> {
        const user = await this.repo.findUserByUsername(username);
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            { userId: user.id, username },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );

        return { userId: user.id, token };
    }
}

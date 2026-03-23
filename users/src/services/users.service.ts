import { UserRepository, UserProfile } from '../repositories/users.repository.js';
import { ProfileNotFoundError, UsernameTakenError, UnexpectedError } from '../errors/domain-errors.js';

export class UsersService {
    constructor(private readonly repo: UserRepository) {}

    async createProfile(username: string, avatar?: string): Promise<UserProfile> {
        try {
            return await this.repo.createProfile(username, avatar);
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
                throw new UsernameTakenError();
            }
            throw new UnexpectedError();
        }
    }

    async getProfile(id: number): Promise<UserProfile> {
        const profile = await this.repo.getById(id);
        if (!profile) {
            throw new ProfileNotFoundError();
        }
        return profile;
    }

    async getProfileByUsername(username: string): Promise<UserProfile> {
        const profile = await this.repo.getByUsername(username);
        if (!profile) {
            throw new ProfileNotFoundError();
        }
        return profile;
    }

    async updateProfile(id: number, data: { avatar?: string }): Promise<UserProfile> {
        const profile = await this.repo.getById(id);
        if (!profile) {
            throw new ProfileNotFoundError();
        }
        return (await this.repo.updateProfile(id, data))!;
    }
}

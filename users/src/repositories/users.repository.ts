import { Database } from "sqlite";

export type UserProfile = {
  id: number;
  username: string;
  avatar: string | null;
  created_at: string;
};

export class UserRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createProfile(username: string, avatar?: string): Promise<UserProfile> {
    const result = await this.db.run(
      "INSERT INTO user_profiles (username, avatar) VALUES (?, ?)",
      [username, avatar ?? null]
    );
    return (await this.getById(result.lastID!))!;
  }

  async getById(id: number): Promise<UserProfile | null> {
    const row = await this.db.get<UserProfile>(
      "SELECT id, username, avatar, created_at FROM user_profiles WHERE id = ?",
      [id]
    );
    return row ?? null;
  }

  async getByUsername(username: string): Promise<UserProfile | null> {
    const row = await this.db.get<UserProfile>(
      "SELECT id, username, avatar, created_at FROM user_profiles WHERE username = ?",
      [username]
    );
    return row ?? null;
  }

  async updateProfile(id: number, data: { avatar?: string }): Promise<UserProfile | null> {
    if (data.avatar !== undefined) {
      await this.db.run(
        "UPDATE user_profiles SET avatar = ? WHERE id = ?",
        [data.avatar, id]
      );
    }
    return this.getById(id);
  }
}

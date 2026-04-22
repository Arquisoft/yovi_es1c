import { Database } from "sqlite";

export type UserProfile = {
  user_id: number;
  username: string;
  avatar: string | null;
  created_at: string;
};

export class UserRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createProfile(user_id: number, username: string, avatar?: string): Promise<UserProfile> {
    const result = await this.db.run(
      "INSERT INTO user_profiles (user_id, username, avatar) VALUES (?, ?, ?)",
      [user_id, username, avatar ?? null]
    );
    return (await this.getById(user_id))!;
  }

  async getById(user_id: number): Promise<UserProfile | null> {
    const row = await this.db.get<UserProfile>(
      "SELECT user_id, username, avatar, created_at FROM user_profiles WHERE user_id = ?",
      [user_id]
    );
    return row ?? null;
  }

  async getByUsername(username: string): Promise<UserProfile | null> {
    const row = await this.db.get<UserProfile>(
      "SELECT user_id, username, avatar, created_at FROM user_profiles WHERE username = ?",
      [username]
    );
    return row ?? null;
  }

  async updateProfile(user_id: number, data: { avatar?: string }): Promise<UserProfile | null> {
    if (data.avatar !== undefined) {
      await this.db.run(
        "UPDATE user_profiles SET avatar = ? WHERE user_id = ?",
        [data.avatar, user_id]
      );
    }
    return this.getById(user_id);
  }
}

import { Database } from "sqlite";

export type UserProfile = {
  user_id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar: string | null;
  created_at: string;
};

export class UserRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // Maps sql row to a TypeScript object
  private map(row: any): UserProfile {
    return {
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      avatar: row.avatar,
      created_at: row.created_at,
    };
  }

  async createProfile(
      user_id: number,
      username: string,
      avatar?: string
  ): Promise<UserProfile> {

    await this.db.run(
        `INSERT INTO user_profiles (user_id, username, avatar)
     VALUES (?, ?, ?)`,
        [user_id, username, avatar ?? null]
    );

    return (await this.getById(user_id))!;
  }

  async getById(user_id: number): Promise<UserProfile | null> {
    const row = await this.db.get(
        `SELECT user_id, username, display_name, email, avatar, created_at
     FROM user_profiles
     WHERE user_id = ?`,
        [user_id]
    );

    return row ? this.map(row) : null;
  }

  async getByUsername(username: string): Promise<UserProfile | null> {
    const row = await this.db.get(
        `SELECT user_id, username, display_name, email, avatar, created_at
     FROM user_profiles
     WHERE username = ?`,
        [username]
    );

    return row ? this.map(row) : null;
  }

  async updateProfile(
      user_id: number,
      data: {
        displayName?: string;
        email?: string;
        avatar?: string;
      }
  ): Promise<UserProfile | null> {
    const { displayName, email, avatar } = data;

    await this.db.run(
        `UPDATE user_profiles
         SET display_name = COALESCE(?, display_name),
             email = COALESCE(?, email),
             avatar = COALESCE(?, avatar)
         WHERE user_id = ?`,
        [displayName, email, avatar, user_id]
    );

    return this.getById(user_id);
  }
}

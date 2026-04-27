import { Database } from "sqlite";
import {
  ForbiddenFriendRequestActionError,
  FriendRequestAlreadyExistsError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  FriendshipNotFoundError,
  ProfileNotFoundError,
  ValidationError,
} from "../errors/domain-errors.js";

export type UserProfile = {
  id: number;
  user_id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar: string | null;
  created_at: string;
};

export type FriendSummary = {
  user_id: number;
  username: string;
  display_name: string | null;
  avatar: string | null;
  friendship_created_at: string;
};

export type FriendRequestSummary = {
  id: number;
  status: "pending" | "accepted";
  created_at: string;
  user: {
    user_id: number;
    username: string;
    display_name: string | null;
    avatar: string | null;
  };
  direction: "incoming" | "outgoing";
};

type ProfileUpdate = {
  displayName?: string;
  email?: string;
  avatar?: string | null;
};

export class UserRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  private map(row: any): UserProfile {
    return {
      id: row.user_id,
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      email: row.email,
      avatar: row.avatar,
      created_at: row.created_at,
    };
  }

  private mapFriend(row: any): FriendSummary {
    return {
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar: row.avatar,
      friendship_created_at: row.friendship_created_at,
    };
  }

  private mapFriendRequest(row: any, direction: "incoming" | "outgoing"): FriendRequestSummary {
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      direction,
      user: {
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        avatar: row.avatar,
      },
    };
  }

  async createProfile(userId: number, username: string, avatar?: string | null): Promise<UserProfile> {
    await this.db.run(
      `INSERT INTO user_profiles (user_id, username, avatar)
       VALUES (?, ?, ?)`,
      [userId, username, avatar ?? null],
    );

    return (await this.getById(userId))!;
  }

  async ensureProfile(userId: number, username: string, avatar?: string | null): Promise<UserProfile> {
    const existing = await this.getById(userId);
    if (existing) return existing;

    return this.createProfile(userId, username, avatar ?? null);
  }

  async getById(userId: number): Promise<UserProfile | null> {
    const row = await this.db.get(
      `SELECT user_id, username, display_name, email, avatar, created_at
       FROM user_profiles
       WHERE user_id = ?`,
      [userId],
    );

    return row ? this.map(row) : null;
  }

  async getByUsername(username: string): Promise<UserProfile | null> {
    const row = await this.db.get(
      `SELECT user_id, username, display_name, email, avatar, created_at
       FROM user_profiles
       WHERE username = ?`,
      [username],
    );

    return row ? this.map(row) : null;
  }

  async updateProfile(userId: number, data: ProfileUpdate): Promise<UserProfile | null> {
    const current = await this.getById(userId);
    if (!current) return null;

    await this.db.run(
      `UPDATE user_profiles
       SET display_name = ?,
           email = ?,
           avatar = ?
       WHERE user_id = ?`,
      [
        data.displayName !== undefined ? data.displayName : current.display_name,
        data.email !== undefined ? data.email : current.email,
        data.avatar !== undefined ? data.avatar : current.avatar,
        userId,
      ],
    );

    return this.getById(userId);
  }

  async listFriends(userId: number): Promise<FriendSummary[]> {
    const rows = await this.db.all(
      `SELECT up.user_id,
              up.username,
              up.display_name,
              up.avatar,
              fr.updated_at AS friendship_created_at
       FROM friend_requests fr
       JOIN user_profiles up
         ON up.user_id = CASE
           WHEN fr.sender_user_id = ? THEN fr.recipient_user_id
           ELSE fr.sender_user_id
         END
       WHERE (fr.sender_user_id = ? OR fr.recipient_user_id = ?)
         AND fr.status = 'accepted'
       ORDER BY COALESCE(up.display_name, up.username) COLLATE NOCASE ASC`,
      [userId, userId, userId],
    );

    return rows.map((row: any) => this.mapFriend(row));
  }

  async hasFriendship(userId: number, otherUserId: number): Promise<boolean> {
    const row = await this.db.get(
      `SELECT 1 AS ok
       FROM friend_requests fr
       WHERE fr.status = 'accepted'
         AND (
           (fr.sender_user_id = ? AND fr.recipient_user_id = ?)
           OR (fr.sender_user_id = ? AND fr.recipient_user_id = ?)
         )
       LIMIT 1`,
      [userId, otherUserId, otherUserId, userId],
    );

    return Boolean(row?.ok);
  }

  async listPendingFriendRequests(userId: number): Promise<FriendRequestSummary[]> {
    const incomingRows = await this.db.all(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              up.user_id,
              up.username,
              up.display_name,
              up.avatar
       FROM friend_requests fr
       JOIN user_profiles up ON up.user_id = fr.sender_user_id
       WHERE fr.recipient_user_id = ?
         AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId],
    );

    const outgoingRows = await this.db.all(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              up.user_id,
              up.username,
              up.display_name,
              up.avatar
       FROM friend_requests fr
       JOIN user_profiles up ON up.user_id = fr.recipient_user_id
       WHERE fr.sender_user_id = ?
         AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [userId],
    );

    return [
      ...incomingRows.map((row: any) => this.mapFriendRequest(row, "incoming")),
      ...outgoingRows.map((row: any) => this.mapFriendRequest(row, "outgoing")),
    ];
  }

  async createFriendRequest(senderUserId: number, recipientUsername: string): Promise<FriendRequestSummary> {
    const normalizedUsername = recipientUsername.trim();

    if (!normalizedUsername) {
      throw new ValidationError("Recipient username is required");
    }

    const sender = await this.getById(senderUserId);
    if (!sender) {
      throw new ProfileNotFoundError();
    }

    const recipient = await this.getByUsername(normalizedUsername);
    if (!recipient) {
      throw new ProfileNotFoundError();
    }

    if (recipient.user_id === senderUserId) {
      throw new ValidationError("You cannot send a friend request to yourself");
    }

    const existing = await this.db.get(
      `SELECT id, sender_user_id, recipient_user_id, status
       FROM friend_requests
       WHERE (sender_user_id = ? AND recipient_user_id = ?)
          OR (sender_user_id = ? AND recipient_user_id = ?)`,
      [senderUserId, recipient.user_id, recipient.user_id, senderUserId],
    );

    if (existing?.status === "accepted") {
      throw new FriendshipAlreadyExistsError();
    }

    if (existing?.status === "pending") {
      throw new FriendRequestAlreadyExistsError();
    }

    const result = await this.db.run(
      `INSERT INTO friend_requests (sender_user_id, recipient_user_id)
       VALUES (?, ?)`,
      [senderUserId, recipient.user_id],
    );

    const row = await this.db.get(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              up.user_id,
              up.username,
              up.display_name,
              up.avatar
       FROM friend_requests fr
       JOIN user_profiles up ON up.user_id = fr.recipient_user_id
       WHERE fr.id = ?`,
      [result.lastID],
    );

    return this.mapFriendRequest(row, "outgoing");
  }

  async acceptFriendRequest(requestId: number, userId: number): Promise<FriendRequestSummary> {
    const existing = await this.db.get(
      `SELECT *
       FROM friend_requests
       WHERE id = ?`,
      [requestId],
    );

    if (!existing) {
      throw new FriendRequestNotFoundError();
    }

    if (existing.recipient_user_id !== userId) {
      throw new ForbiddenFriendRequestActionError();
    }

    await this.db.run(
      `UPDATE friend_requests
       SET status = 'accepted',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [requestId],
    );

    const row = await this.db.get(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              up.user_id,
              up.username,
              up.display_name,
              up.avatar
       FROM friend_requests fr
       JOIN user_profiles up ON up.user_id = fr.sender_user_id
       WHERE fr.id = ?`,
      [requestId],
    );

    return this.mapFriendRequest(row, "incoming");
  }

  async deleteFriendRequest(requestId: number, userId: number): Promise<void> {
    const existing = await this.db.get(
      `SELECT *
       FROM friend_requests
       WHERE id = ?`,
      [requestId],
    );

    if (!existing) {
      throw new FriendRequestNotFoundError();
    }

    if (existing.sender_user_id !== userId && existing.recipient_user_id !== userId) {
      throw new ForbiddenFriendRequestActionError();
    }

    await this.db.run(
      `DELETE FROM friend_requests
       WHERE id = ?`,
      [requestId],
    );
  }

  async deleteFriendship(userId: number, friendUserId: number): Promise<void> {
    if (userId === friendUserId) {
      throw new ValidationError("You cannot remove yourself as a friend");
    }

    const result = await this.db.run(
      `DELETE FROM friend_requests
       WHERE status = 'accepted'
         AND (
           (sender_user_id = ? AND recipient_user_id = ?)
           OR (sender_user_id = ? AND recipient_user_id = ?)
         )`,
      [userId, friendUserId, friendUserId, userId],
    );

    if (!result.changes) {
      throw new FriendshipNotFoundError();
    }
  }
}

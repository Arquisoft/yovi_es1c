import { Database } from "sqlite";
import { NotFriendsError, ValidationError } from "../errors/domain-errors.js";
import { UserRepository } from "./users.repository.js";

export type ChatConversationSummary = {
  id: number;
  updated_at: string;
  other_user: {
    user_id: number;
    username: string;
    display_name: string | null;
    avatar: string | null;
  };
  last_message: {
    id: number;
    sender_user_id: number;
    text: string;
    created_at: string;
  } | null;
};

export type ChatMessage = {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  text: string;
  created_at: string;
};

export class ChatRepository {
  private readonly db: Database;
  private readonly usersRepo: UserRepository;

  constructor(db: Database, usersRepo: UserRepository) {
    this.db = db;
    this.usersRepo = usersRepo;
  }

  async listConversations(userId: number): Promise<ChatConversationSummary[]> {
    const rows = await this.db.all(
      `SELECT c.id AS conversation_id,
              c.updated_at AS conversation_updated_at,
              up.user_id AS other_user_id,
              up.username AS other_username,
              up.display_name AS other_display_name,
              up.avatar AS other_avatar,
              lm.id AS last_message_id,
              lm.sender_user_id AS last_message_sender_user_id,
              lm.text AS last_message_text,
              lm.created_at AS last_message_created_at
       FROM chat_conversations c
       JOIN user_profiles up
         ON up.user_id = CASE
           WHEN c.user_low_id = ? THEN c.user_high_id
           ELSE c.user_low_id
         END
       LEFT JOIN chat_messages lm
         ON lm.id = (
           SELECT m2.id
           FROM chat_messages m2
           WHERE m2.conversation_id = c.id
           ORDER BY m2.created_at DESC, m2.id DESC
           LIMIT 1
         )
       WHERE c.user_low_id = ? OR c.user_high_id = ?
       ORDER BY c.updated_at DESC, c.id DESC`,
      [userId, userId, userId]
    );

    return rows.map((row: any) => ({
      id: row.conversation_id,
      updated_at: row.conversation_updated_at,
      other_user: {
        user_id: row.other_user_id,
        username: row.other_username,
        display_name: row.other_display_name,
        avatar: row.other_avatar,
      },
      last_message: row.last_message_id
        ? {
            id: row.last_message_id,
            sender_user_id: row.last_message_sender_user_id,
            text: row.last_message_text,
            created_at: row.last_message_created_at,
          }
        : null,
    }));
  }

  async getOrCreateConversationForFriends(userId: number, friendUserId: number): Promise<number> {
    if (userId === friendUserId) {
      throw new ValidationError("You cannot chat with yourself");
    }

    const areFriends = await this.usersRepo.hasFriendship(userId, friendUserId);
    if (!areFriends) {
      throw new NotFriendsError();
    }

    const userLowId = Math.min(userId, friendUserId);
    const userHighId = Math.max(userId, friendUserId);

    const existing = await this.db.get(
      `SELECT id
       FROM chat_conversations
       WHERE user_low_id = ? AND user_high_id = ?`,
      [userLowId, userHighId]
    );

    if (existing?.id) {
      return existing.id as number;
    }

    const insert = await this.db.run(
      `INSERT INTO chat_conversations (user_low_id, user_high_id)
       VALUES (?, ?)`,
      [userLowId, userHighId]
    );

    return insert.lastID as number;
  }

  async listMessages(
    userId: number,
    friendUserId: number,
    options?: { limit?: number; beforeId?: number }
  ): Promise<{ conversation_id: number; messages: ChatMessage[] }> {
    const conversationId = await this.getOrCreateConversationForFriends(userId, friendUserId);
    const limit = Math.max(1, Math.min(Number(options?.limit ?? 50), 100));
    const beforeId = options?.beforeId ? Number(options.beforeId) : null;

    const rows = await this.db.all(
      beforeId
        ? `SELECT id, conversation_id, sender_user_id, text, created_at
           FROM chat_messages
           WHERE conversation_id = ?
             AND id < ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`
        : `SELECT id, conversation_id, sender_user_id, text, created_at
           FROM chat_messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
      beforeId ? [conversationId, beforeId, limit] : [conversationId, limit]
    );

    return {
      conversation_id: conversationId,
      messages: rows.map((row: any) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_user_id: row.sender_user_id,
        text: row.text,
        created_at: row.created_at,
      })),
    };
  }

  async sendMessage(userId: number, friendUserId: number, text: string): Promise<ChatMessage> {
    const normalized = String(text ?? "").trim();
    if (!normalized) {
      throw new ValidationError("Message text is required");
    }
    if (normalized.length > 2000) {
      throw new ValidationError("Message text is too long");
    }

    const conversationId = await this.getOrCreateConversationForFriends(userId, friendUserId);

    const insert = await this.db.run(
      `INSERT INTO chat_messages (conversation_id, sender_user_id, text)
       VALUES (?, ?, ?)`,
      [conversationId, userId, normalized]
    );

    await this.db.run(
      `UPDATE chat_conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [conversationId]
    );

    const row = await this.db.get(
      `SELECT id, conversation_id, sender_user_id, text, created_at
       FROM chat_messages
       WHERE id = ?`,
      [insert.lastID]
    );

    return {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_user_id: row.sender_user_id,
      text: row.text,
      created_at: row.created_at,
    };
  }
}


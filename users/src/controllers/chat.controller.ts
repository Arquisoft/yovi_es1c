import type { Request, Response } from "express";
import { ChatRepository } from "../repositories/chat.repository.js";
import { HttpError } from "../errors/http-error.js";

export class ChatController {
  constructor(private readonly chatRepo: ChatRepository) {}

  async listMyConversations(req: Request, res: Response): Promise<void> {
    const userId = Number(req.userId);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const conversations = await this.chatRepo.listConversations(userId);
      res.json(
        conversations.map((c) => ({
          id: c.id,
          updatedAt: c.updated_at,
          otherUser: {
            id: c.other_user.user_id,
            username: c.other_user.username,
            displayName: c.other_user.display_name,
            avatar: c.other_user.avatar,
          },
          lastMessage: c.last_message
            ? {
                id: c.last_message.id,
                senderUserId: c.last_message.sender_user_id,
                text: c.last_message.text,
                createdAt: c.last_message.created_at,
              }
            : null,
        }))
      );
    } catch (error) {
      this.handleHttpError(res, error);
    }
  }

  async listMessagesWithFriend(req: Request, res: Response): Promise<void> {
    const userId = Number(req.userId);
    const friendUserId = Number(req.params["friendUserId"]);
    const limit = req.query["limit"] ? Number(req.query["limit"]) : undefined;
    const beforeId = req.query["beforeId"] ? Number(req.query["beforeId"]) : undefined;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!friendUserId) {
      res.status(400).json({ error: "Invalid friend user id" });
      return;
    }

    try {
      const data = await this.chatRepo.listMessages(userId, friendUserId, { limit, beforeId });
      res.json({
        conversationId: data.conversation_id,
        messages: data.messages.map((m) => ({
          id: m.id,
          conversationId: m.conversation_id,
          senderUserId: m.sender_user_id,
          text: m.text,
          createdAt: m.created_at,
        })),
      });
    } catch (error) {
      this.handleHttpError(res, error);
    }
  }

  async sendMessageToFriend(req: Request, res: Response): Promise<void> {
    const userId = Number(req.userId);
    const friendUserId = Number(req.params["friendUserId"]);
    const text = String(req.body?.text ?? "");

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!friendUserId) {
      res.status(400).json({ error: "Invalid friend user id" });
      return;
    }

    try {
      const message = await this.chatRepo.sendMessage(userId, friendUserId, text);
      res.status(201).json({
        id: message.id,
        conversationId: message.conversation_id,
        senderUserId: message.sender_user_id,
        text: message.text,
        createdAt: message.created_at,
      });
    } catch (error) {
      this.handleHttpError(res, error);
    }
  }

  private handleHttpError(res: Response, error: unknown): void {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ error: error.error, message: error.message });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "internal_server_error", message: "Internal server error" });
  }
}


import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatRouter } from "../src/routes/chat.routes.js";
import { ChatController } from "../src/controllers/chat.controller.js";

describe("chat routes auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AUTH_SERVICE_URL = "http://auth.local";
  });

  it("protects chat routes with JWT verification", async () => {
    const controller = {
      listMyConversations: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      listMessagesWithFriend: vi.fn(async (_req, res) => res.status(200).json({ ok: true })),
      sendMessageToFriend: vi.fn(async (_req, res) => res.status(201).json({ ok: true })),
    } as unknown as ChatController;

    const app = express();
    app.use(express.json());
    app.use("/api/users/chat", createChatRouter(controller));

    const responses = await Promise.all([
      request(app).get("/api/users/chat/conversations"),
      request(app).get("/api/users/chat/with/2/messages"),
      request(app).post("/api/users/chat/with/2/messages").send({ text: "hola" }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }

    expect(controller.listMyConversations).not.toHaveBeenCalled();
    expect(controller.listMessagesWithFriend).not.toHaveBeenCalled();
    expect(controller.sendMessageToFriend).not.toHaveBeenCalled();
  });
});


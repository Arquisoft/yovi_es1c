import { Router } from "express";
import { verifyJwtMiddleware } from "../middleware/verify-jwt.js";
import { ChatController } from "../controllers/chat.controller.js";

export function createChatRouter(controller: ChatController): Router {
  const router = Router();

  router.get("/conversations", verifyJwtMiddleware, controller.listMyConversations.bind(controller));
  router.get("/with/:friendUserId/messages", verifyJwtMiddleware, controller.listMessagesWithFriend.bind(controller));
  router.post("/with/:friendUserId/messages", verifyJwtMiddleware, controller.sendMessageToFriend.bind(controller));

  return router;
}


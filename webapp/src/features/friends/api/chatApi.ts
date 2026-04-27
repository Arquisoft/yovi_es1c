import { API_CONFIG } from "../../../config/api.config";
import { fetchWithAuth } from "../../../shared/api/fetchWithAuth";

export type ChatMessage = {
  id: number;
  conversationId: number;
  senderUserId: number;
  text: string;
  createdAt: string;
};

export type ChatMessagesResponse = {
  conversationId: number;
  messages: ChatMessage[];
};

async function parseError(response: Response, fallbackMessage: string): Promise<Error> {
  try {
    const data = await response.json();
    return new Error(data.message ?? fallbackMessage);
  } catch {
    return new Error(fallbackMessage);
  }
}

export async function getMessagesWithFriend(
  friendUserId: number,
  options?: { limit?: number; beforeId?: number },
): Promise<ChatMessagesResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.beforeId) params.set("beforeId", String(options.beforeId));

  const url = `${API_CONFIG.USERS_API}/chat/with/${friendUserId}/messages${params.size ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url);

  if (!response.ok) {
    throw await parseError(response, "No se pudo cargar el chat");
  }

  return (await response.json()) as ChatMessagesResponse;
}

export async function sendMessageToFriend(friendUserId: number, text: string): Promise<ChatMessage> {
  const response = await fetchWithAuth(`${API_CONFIG.USERS_API}/chat/with/${friendUserId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw await parseError(response, "No se pudo enviar el mensaje");
  }

  return (await response.json()) as ChatMessage;
}


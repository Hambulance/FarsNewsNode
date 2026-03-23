import { chatConfig } from "@/lib/chat-config";
import type { ChatState } from "@/lib/types";

export const defaultChatState: ChatState = {
  conversations: [],
  activeConversationId: null
};

export function loadChatState(): ChatState {
  if (typeof window === "undefined") {
    return defaultChatState;
  }

  try {
    const raw = window.localStorage.getItem(chatConfig.storageKey);
    if (!raw) {
      return defaultChatState;
    }

    const parsed = JSON.parse(raw) as ChatState;
    if (!Array.isArray(parsed.conversations)) {
      return defaultChatState;
    }

    return {
      conversations: parsed.conversations.map((conversation) => ({
        ...conversation,
        documents: Array.isArray((conversation as { documents?: unknown[] }).documents)
          ? ((conversation as { documents?: unknown[] }).documents as ChatState["conversations"][number]["documents"])
          : []
      })),
      activeConversationId: parsed.activeConversationId || parsed.conversations[0]?.id || null
    };
  } catch (error) {
    return defaultChatState;
  }
}

export function saveChatState(state: ChatState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(chatConfig.storageKey, JSON.stringify(state));
}

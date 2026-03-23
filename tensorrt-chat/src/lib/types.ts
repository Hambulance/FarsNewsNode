export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type UploadedDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  extractedText: string;
  createdAt: string;
  characterCount: number;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  documents: UploadedDocument[];
};

export type ChatState = {
  conversations: Conversation[];
  activeConversationId: string | null;
};

export type ApiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ApiDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  extractedText: string;
  characterCount: number;
  createdAt: string;
};

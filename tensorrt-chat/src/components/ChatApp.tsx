"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatInput } from "@/components/ChatInput";
import { ChatWindow } from "@/components/ChatWindow";
import { Sidebar } from "@/components/Sidebar";
import { defaultChatState, loadChatState, saveChatState } from "@/lib/storage";
import type { ApiChatMessage, ApiDocument, ChatMessage, ChatState, Conversation, UploadedDocument } from "@/lib/types";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createConversation(initialMessage?: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: initialMessage ? initialMessage.slice(0, 42) : "New Chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
    documents: []
  };
}

function isApiChatMessage(message: ChatMessage): message is ChatMessage & ApiChatMessage {
  return message.role === "user" || message.role === "assistant";
}

export function ChatApp() {
  const [chatState, setChatState] = useState<ChatState>(defaultChatState);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) {
      return;
    }

    initialLoadRef.current = true;
    const stored = loadChatState();
    if (stored.conversations.length === 0) {
      const initialConversation = createConversation();
      setChatState({
        conversations: [initialConversation],
        activeConversationId: initialConversation.id
      });
    } else {
      setChatState(stored);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveChatState(chatState);
  }, [chatState, isHydrated]);

  const activeConversation = useMemo(() => {
    return (
      chatState.conversations.find((conversation) => conversation.id === chatState.activeConversationId) ||
      chatState.conversations[0] ||
      null
    );
  }, [chatState]);

  function updateConversation(conversationId: string, updater: (conversation: Conversation) => Conversation) {
    setChatState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation
      )
    }));
  }

  function handleNewConversation() {
    const conversation = createConversation();
    setChatState((current) => ({
      conversations: [conversation, ...current.conversations],
      activeConversationId: conversation.id
    }));
    setError(null);
  }

  function handleDeleteConversation(conversationId: string) {
    setChatState((current) => {
      const remainingConversations = current.conversations.filter((conversation) => conversation.id !== conversationId);
      const nextActiveConversationId =
        current.activeConversationId === conversationId
          ? remainingConversations[0]?.id || null
          : current.activeConversationId;

      if (remainingConversations.length === 0) {
        const freshConversation = createConversation();
        return {
          conversations: [freshConversation],
          activeConversationId: freshConversation.id
        };
      }

      return {
        conversations: remainingConversations,
        activeConversationId: nextActiveConversationId
      };
    });
    setError(null);
  }

  function handleRemoveDocument(documentId: string) {
    if (!activeConversation) {
      return;
    }

    updateConversation(activeConversation.id, (currentConversation) => ({
      ...currentConversation,
      updatedAt: new Date().toISOString(),
      documents: currentConversation.documents.filter((document) => document.id !== documentId)
    }));
  }

  async function handleUploadDocuments(files: FileList | null) {
    if (!files || files.length === 0 || !activeConversation) {
      return;
    }

    setError(null);
    setIsUploadingDocuments(true);

    try {
      const uploadedDocuments: UploadedDocument[] = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch("/api/document", {
          method: "POST",
          body: formData
        });

        const payload = (await response.json()) as ApiDocument & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || `Failed to process ${file.name}.`);
        }

        uploadedDocuments.push(payload);
      }

      updateConversation(activeConversation.id, (currentConversation) => ({
        ...currentConversation,
        updatedAt: new Date().toISOString(),
        documents: [...currentConversation.documents, ...uploadedDocuments]
      }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to process uploaded documents.");
    } finally {
      setIsUploadingDocuments(false);
    }
  }

  async function handleSend(content: string) {
    setError(null);

    let conversation = activeConversation;
    if (!conversation) {
      conversation = createConversation(content);
      setChatState((current) => ({
        conversations: [conversation as Conversation, ...current.conversations],
        activeConversationId: conversation?.id || null
      }));
    }

    if (!conversation) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };

    updateConversation(conversation.id, (currentConversation) => ({
      ...currentConversation,
      title: currentConversation.messages.length === 0 ? content.slice(0, 42) : currentConversation.title,
      updatedAt: new Date().toISOString(),
      messages: [...currentConversation.messages, userMessage]
    }));

    setIsLoading(true);

    try {
      const requestMessages: ApiChatMessage[] = [...(conversation.messages || []), userMessage]
        .filter(isApiChatMessage)
        .map((message) => ({
          role: message.role,
          content: message.content
        }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: requestMessages,
          documents: conversation.documents
        })
      });

      let payload: { content?: string; error?: string; details?: string };
      try {
        payload = (await response.json()) as { content?: string; error?: string; details?: string };
      } catch (error) {
        throw new Error("The server response could not be parsed.");
      }

      if (!response.ok) {
        throw new Error([payload.error, payload.details].filter(Boolean).join(" - ") || "Failed to send the message.");
      }

      if (!payload.content) {
        throw new Error("The assistant returned an empty response.");
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: payload.content,
        createdAt: new Date().toISOString()
      };

      updateConversation(conversation.id, (currentConversation) => ({
        ...currentConversation,
        updatedAt: new Date().toISOString(),
        messages: [...currentConversation.messages, assistantMessage]
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-slate-200">
        Loading chat interface...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1020] px-4 py-4 text-slate-100 md:px-6 md:py-6">
      <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Sidebar
          conversations={chatState.conversations}
          activeConversationId={activeConversation?.id || null}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          onSelectConversation={(conversationId) => {
            setChatState((current) => ({
              ...current,
              activeConversationId: conversationId
            }));
            setError(null);
          }}
        />

        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
          <ChatWindow
            title={activeConversation?.title || "New Chat"}
            messages={activeConversation?.messages || []}
            isLoading={isLoading}
            error={error}
          />
          <ChatInput
            disabled={isLoading}
            documents={activeConversation?.documents || []}
            isUploadingDocuments={isUploadingDocuments}
            onSend={handleSend}
            onUploadDocuments={handleUploadDocuments}
            onRemoveDocument={handleRemoveDocument}
          />
        </section>
      </div>
    </main>
  );
}

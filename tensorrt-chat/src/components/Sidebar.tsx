"use client";

import { chatConfig } from "@/lib/chat-config";
import type { Conversation } from "@/lib/types";

type SidebarProps = {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
};

export function Sidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation
}: SidebarProps) {
  return (
    <aside className="flex h-full flex-col rounded-[28px] border border-slate-800 bg-slate-950/90 p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">TensorRT Chat</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">Conversations</h1>
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 transition hover:border-emerald-600 hover:text-emerald-300"
        >
          New Chat
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/60 p-4 text-sm leading-7 text-slate-400">
            No saved conversations yet.
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={[
                  "rounded-2xl border px-4 py-3 transition",
                  isActive
                    ? "border-emerald-700 bg-emerald-950/60"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <strong className="block truncate text-sm font-medium text-slate-100">{conversation.title}</strong>
                    <span className="mt-2 block text-xs text-slate-400" dir="ltr">
                      {new Date(conversation.updatedAt).toLocaleString("en-US")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-rose-700 hover:text-rose-300"
                    aria-label={`Delete ${conversation.title}`}
                    title="Delete conversation"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs leading-7 text-slate-400">
        <div className="mb-2 text-slate-300">Config</div>
        <div dir="ltr">model: {chatConfig.model}</div>
        <div dir="ltr">baseUrl: {chatConfig.baseUrl}</div>
        <div dir="ltr">max_tokens: {chatConfig.maxTokens}</div>
        <div dir="ltr">temperature: {chatConfig.temperature}</div>
      </div>
    </aside>
  );
}

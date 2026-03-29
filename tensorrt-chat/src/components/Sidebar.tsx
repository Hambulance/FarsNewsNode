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
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || null;

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,20,26,0.98),rgba(10,11,15,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.48)]">
      <div className="rounded-[26px] border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#1f6ed4,#0a4ea3)] shadow-[0_10px_24px_rgba(18,97,216,0.35)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" aria-hidden="true">
              <path
                d="M8 7.5h8M8 12h8M8 16.5h5M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">TensorRT Chat</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-50">The Silent Engine</h1>
            <p className="mt-1 text-xs text-slate-500">Local-first AI workspace</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewConversation}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#8bb7ff,#1d73d1)] px-4 py-3.5 text-sm font-semibold text-[#08111d] shadow-[0_16px_36px_rgba(40,115,216,0.38)] transition hover:brightness-110"
        >
          <span className="text-lg leading-none">+</span>
          <span>New Chat</span>
        </button>
      </div>

      <div className="mt-5">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-600">Chat History</p>
      </div>

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {conversations.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.02] p-4 text-sm leading-7 text-slate-400">
            No saved conversations yet.
          </div>
        ) : (
          conversations.map((conversation) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={[
                  "rounded-[24px] border px-4 py-3 transition",
                  isActive
                    ? "border-[#3f72bd] bg-[linear-gradient(180deg,rgba(20,35,62,0.92),rgba(13,20,32,0.92))] shadow-[0_12px_30px_rgba(29,115,209,0.16)]"
                    : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.035]"
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-[#8ab4ff]" : "bg-slate-600"}`} />
                      <span>{conversation.messages.length > 0 ? "Active Thread" : "Blank Session"}</span>
                    </div>
                    <strong className="mt-3 block truncate text-sm font-medium text-slate-100">{conversation.title}</strong>
                    <span className="mt-2 block text-xs text-slate-400" dir="ltr">
                      {new Date(conversation.updatedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit"
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    className="rounded-xl border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300"
                    aria-label={`Delete ${conversation.title}`}
                    title="Delete conversation"
                  >
                    Del
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,19,26,0.95),rgba(11,13,18,0.95))] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-600">Runtime</p>
              <p className="mt-2 text-sm font-semibold text-slate-100">{chatConfig.model}</p>
            </div>
            <div className="rounded-full border border-[#365788] bg-[#0f1d33] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9dc1ff]">
              Local
            </div>
          </div>

          <div className="mt-4 space-y-3 text-xs text-slate-400">
            <div className="rounded-2xl border border-white/8 bg-[#090b10] px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="uppercase tracking-[0.22em] text-slate-500">Endpoint</span>
                <span className="text-slate-300">Online</span>
              </div>
              <div dir="ltr" className="truncate text-slate-300">
                {chatConfig.baseUrl}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Tokens</div>
                <div className="mt-2 text-sm font-semibold text-slate-100" dir="ltr">
                  {chatConfig.maxTokens}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Temp</div>
                <div className="mt-2 text-sm font-semibold text-slate-100" dir="ltr">
                  {chatConfig.temperature}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-600">Operator</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#1b2230,#101520)] text-sm font-semibold text-slate-200">
              LA
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">Local Admin</div>
              <div className="truncate text-xs text-slate-500">
                {activeConversation ? "Attached to active conversation" : "Ready for a new session"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

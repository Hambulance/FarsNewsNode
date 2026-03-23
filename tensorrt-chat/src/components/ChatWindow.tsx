"use client";

import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

type ChatWindowProps = {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
};

export function ChatWindow({ title, messages, isLoading, error }: ChatWindowProps) {
  return (
    <section className="flex h-full flex-col rounded-[28px] border border-slate-800 bg-slate-950/90 shadow-panel">
      <header className="border-b border-slate-800 px-6 py-5">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Conversation</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">
          Web search and page crawling are enabled automatically for each request.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-80 items-center justify-center">
            <div className="max-w-xl rounded-[28px] border border-dashed border-slate-800 bg-slate-900/70 px-8 py-10 text-center">
              <h3 className="text-lg font-semibold text-slate-100">Local TensorRT-LLM Chat</h3>
              <p className="mt-3 text-sm leading-8 text-slate-400">
                Type a message below. Requests are sent only to your local model server at
                <span dir="ltr" className="mx-1 inline-block text-slate-300">
                  http://127.0.0.1:8000
                </span>
                .
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}

        {isLoading ? (
          <div className="flex justify-end">
            <div className="rounded-3xl border border-emerald-900/60 bg-emerald-950/50 px-5 py-4 text-sm text-emerald-50">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 [animation-delay:120ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 [animation-delay:240ms]" />
                <span className="mr-2 text-emerald-200">Model is responding...</span>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-900/70 bg-rose-950/50 px-4 py-3 text-sm leading-7 text-rose-100">
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}

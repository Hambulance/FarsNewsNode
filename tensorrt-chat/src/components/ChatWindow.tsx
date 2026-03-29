"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";

type ChatWindowProps = {
  title: string;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
};

export function ChatWindow({ title, messages, isLoading, error }: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const bottom = bottomRef.current;
    if (!container || !bottom) {
      return;
    }

    bottom.scrollIntoView({
      block: "end"
    });
  }, [messages, isLoading, error, title]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,17,23,0.97),rgba(8,9,13,0.97))] shadow-[0_24px_70px_rgba(0,0,0,0.44)]">
      <header className="border-b border-white/8 px-5 py-5 md:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Conversation</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
              Refine prompts, inspect local responses, and keep the full thread pinned to this workspace.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
              Web context on
            </span>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2">
              Local inference
            </span>
          </div>
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6 lg:px-8 lg:py-7"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[26rem] items-center justify-center">
            <div className="max-w-3xl rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,21,28,0.94),rgba(11,13,18,0.94))] px-8 py-10 text-center shadow-[0_20px_60px_rgba(0,0,0,0.32)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-[linear-gradient(180deg,#1f6ed4,#0a4ea3)] shadow-[0_14px_32px_rgba(31,110,212,0.32)]">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" aria-hidden="true">
                  <path
                    d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <h3 className="mt-6 text-3xl font-semibold tracking-tight text-slate-50">Engine Control</h3>
              <p className="mt-4 text-sm leading-8 text-slate-400 md:text-[15px]">
                Start a fresh local session, attach files, and send instructions directly to your TensorRT-LLM
                runtime. Requests stay pinned to
                <span dir="ltr" className="mx-1 inline-block text-slate-300">
                  127.0.0.1:8000
                </span>
                with no external chat provider in the loop.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">Fast local responses</div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">Web context enabled</div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">Document-aware prompts</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="mx-auto flex max-w-5xl justify-start">
            <div className="rounded-[26px] border border-[#274a7f] bg-[linear-gradient(180deg,rgba(17,28,47,0.92),rgba(10,16,27,0.92))] px-5 py-4 text-sm text-slate-100 shadow-[0_18px_45px_rgba(8,20,43,0.4)]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ab4ff]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ab4ff] [animation-delay:120ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ab4ff] [animation-delay:240ms]" />
                <span className="ml-2 text-slate-200">Local engine is composing a response...</span>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mx-auto max-w-5xl rounded-[22px] border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm leading-7 text-rose-100">
            {error}
          </div>
        ) : null}

        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </section>
  );
}

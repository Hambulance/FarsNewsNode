"use client";

import type { ChatMessage } from "@/lib/types";

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasPersian = /[\u0600-\u06FF]/.test(message.content);
  const contentDirection = !isUser && hasPersian ? "rtl" : "ltr";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <article
        className={[
          "max-w-[85%] rounded-3xl border px-5 py-4 shadow-panel",
          isUser
            ? "border-slate-700 bg-slate-900 text-slate-100"
            : "border-emerald-900/60 bg-emerald-950/70 text-emerald-50"
        ].join(" ")}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-full border border-white/10 px-2 py-1">
            {isUser ? "User" : "Assistant"}
          </span>
          <span dir="ltr">{new Date(message.createdAt).toLocaleTimeString("en-US")}</span>
        </div>
        <p
          dir={contentDirection}
          className={[
            "whitespace-pre-wrap break-words text-sm leading-8 md:text-[15px]",
            contentDirection === "rtl" ? "text-right" : "text-left"
          ].join(" ")}
        >
          {message.content}
        </p>
      </article>
    </div>
  );
}

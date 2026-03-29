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
          "max-w-[88%] rounded-[30px] border px-5 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.28)] md:px-6 md:py-5",
          isUser
            ? "border-white/10 bg-[linear-gradient(180deg,rgba(35,37,44,0.97),rgba(24,26,32,0.97))] text-slate-100"
            : "border-[#274a7f] bg-[linear-gradient(180deg,rgba(15,26,45,0.96),rgba(11,18,30,0.96))] text-slate-50"
        ].join(" ")}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400">
          <span
            className={[
              "rounded-full border px-2.5 py-1 font-semibold",
              isUser
                ? "border-white/10 bg-white/[0.04] text-slate-300"
                : "border-[#365788] bg-[#0f1d33] text-[#9dc1ff]"
            ].join(" ")}
          >
            {isUser ? "Operator" : "Assistant"}
          </span>
          <span dir="ltr">{new Date(message.createdAt).toLocaleTimeString("en-US")}</span>
        </div>
        <p
          dir={contentDirection}
          className={[
            "whitespace-pre-wrap break-words text-sm leading-8 md:text-[15px] md:leading-8",
            contentDirection === "rtl" ? "text-right" : "text-left"
          ].join(" ")}
        >
          {message.content}
        </p>
      </article>
    </div>
  );
}

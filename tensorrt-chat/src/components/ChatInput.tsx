"use client";

import type { UploadedDocument } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

type ChatInputProps = {
  disabled?: boolean;
  documents: UploadedDocument[];
  isUploadingDocuments: boolean;
  onSend: (value: string) => Promise<void> | void;
  onUploadDocuments: (files: FileList | null) => Promise<void> | void;
  onRemoveDocument: (documentId: string) => void;
};

export function ChatInput({
  disabled = false,
  documents,
  isUploadingDocuments,
  onSend,
  onUploadDocuments,
  onRemoveDocument
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [menuOpen]);

  async function submitValue(nextValue: string) {
    const trimmed = nextValue.trim();
    if (!trimmed || disabled) {
      return;
    }

    setValue("");
    textareaRef.current?.focus();
    await onSend(trimmed);
    textareaRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitValue(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(22,24,30,0.96),rgba(14,16,21,0.96))] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.38)] md:p-4"
    >
      {documents.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200"
            >
              <span className="max-w-52 truncate">{document.fileName}</span>
              <button
                type="button"
                onClick={() => onRemoveDocument(document.id)}
                className="text-slate-400 transition hover:text-rose-300"
                aria-label={`Remove ${document.fileName}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3 px-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-[#8ab4ff] shadow-[0_0_16px_rgba(138,180,255,0.85)]" />
          <span>Message Dock</span>
        </div>
        <div className="text-right text-[10px] text-slate-600">
          {isUploadingDocuments ? "Processing attachments" : "Local inference only"}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#11141b] text-3xl leading-none text-slate-200 transition hover:border-[#3f72bd] hover:text-white"
            aria-expanded={menuOpen ? "true" : "false"}
            aria-label="Open attachment menu"
          >
            +
          </button>

          {menuOpen ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 z-20 w-72 rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,28,35,0.98),rgba(15,17,22,0.98))] p-3 text-left shadow-2xl">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm text-white transition hover:bg-white/5">
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    setMenuOpen(false);
                    void onUploadDocuments(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
                <span className="text-lg" aria-hidden="true">
                  📎
                </span>
                <span>{isUploadingDocuments ? "Processing files..." : "Add photos & files"}</span>
              </label>
              <div className="my-2 border-t border-white/10" />
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300">
                <span className="text-lg" aria-hidden="true">
                  🌐
                </span>
                <span>Web search is enabled by default</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 rounded-[26px] border border-white/8 bg-[#11141b] px-4 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitValue(value);
              }
            }}
            rows={1}
            placeholder="Type a message to the local engine..."
            className="min-h-14 w-full resize-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>Press Enter to send</span>
            <span dir="ltr">TensorRT-LLM local runtime</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex h-14 min-w-28 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#8bb7ff,#1d73d1)] px-5 text-sm font-semibold text-[#08111d] shadow-[0_16px_36px_rgba(40,115,216,0.36)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
        >
          Send
        </button>
      </div>
    </form>
  );
}

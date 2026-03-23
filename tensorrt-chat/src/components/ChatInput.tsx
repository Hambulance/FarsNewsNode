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
      className="rounded-[28px] border border-slate-800 bg-slate-950/90 p-3 shadow-panel"
    >
      {documents.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"
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

      <div className="flex items-end gap-3">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-3xl leading-none text-slate-200 transition hover:border-slate-700 hover:text-white"
            aria-expanded={menuOpen ? "true" : "false"}
            aria-label="Open attachment menu"
          >
            +
          </button>

          {menuOpen ? (
            <div className="absolute bottom-[calc(100%+12px)] left-0 z-20 w-72 rounded-[26px] border border-white/10 bg-[#2f2f2f] p-3 text-left shadow-2xl">
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
                <span className="text-lg">📎</span>
                <span>{isUploadingDocuments ? "Processing files..." : "Add photos & files"}</span>
              </label>
              <div className="my-2 border-t border-white/10" />
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300">
                <span className="text-lg">🌐</span>
                <span>Web search is enabled by default</span>
              </div>
            </div>
          ) : null}
        </div>

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
          placeholder="Send a message to your local TensorRT-LLM model..."
          className="min-h-14 flex-1 resize-none rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-600"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="inline-flex h-14 min-w-28 items-center justify-center rounded-2xl bg-emerald-600 px-5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
        >
          Send
        </button>
      </div>
    </form>
  );
}

import { chatConfig } from "@/lib/chat-config";
import type { ApiDocument } from "@/lib/types";

export function buildDocumentContext(documents: ApiDocument[] = []) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return "";
  }

  const context = documents
    .map(
      (document, index) =>
        `Document ${index + 1}\nName: ${document.fileName}\nType: ${document.mimeType}\nContent: ${document.extractedText}`
    )
    .join("\n\n");

  return context.slice(0, chatConfig.maxDocumentContextChars);
}

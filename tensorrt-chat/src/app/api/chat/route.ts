import { chatConfig } from "@/lib/chat-config";
import { chatAccessCookieName, isValidAccessToken } from "@/lib/auth";
import { buildDocumentContext } from "@/lib/document-context";
import type { ApiChatMessage, ApiDocument } from "@/lib/types";
import { buildWebContext } from "@/lib/web-context";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

type TensorRtResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function isValidMessageArray(value: unknown): value is ApiChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    )
  );
}

function isValidDocumentArray(value: unknown): value is ApiDocument[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.fileName === "string" &&
        typeof item.mimeType === "string" &&
        typeof item.extractedText === "string" &&
        typeof item.characterCount === "number" &&
        typeof item.createdAt === "string"
    )
  );
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accessCookie = cookieStore.get(chatAccessCookieName)?.value;

  if (!isValidAccessToken(accessCookie)) {
    return NextResponse.json(
      {
        error: "Unauthorized access. Open this chat tool from the admin panel on the news site."
      },
      { status: 401 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!isValidMessageArray(messages)) {
    return NextResponse.json({ error: "The messages array is invalid." }, { status: 400 });
  }

  const documents = (body as { documents?: unknown })?.documents;
  if (documents !== undefined && !isValidDocumentArray(documents)) {
    return NextResponse.json({ error: "The documents array is invalid." }, { status: 400 });
  }

  try {
    const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const [webContext, documentContext] = await Promise.all([
      buildWebContext(latestUserPrompt),
      Promise.resolve(buildDocumentContext(documents || []))
    ]);

    const supplementalContext = [
      webContext
        ? `Web research context collected automatically for the latest user request:\n${webContext}`
        : "",
      documentContext
        ? `User-provided document context:\n${documentContext}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch(`${chatConfig.baseUrl}${chatConfig.chatEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: chatConfig.model,
        messages: [
          {
            role: "system",
            content:
              `${chatConfig.systemPrompt}\nNever say you cannot browse or search the web if retrieved web context is provided in later system messages. Use that retrieved context directly and summarize it in Farsi.`
          },
          ...(supplementalContext
            ? [
                {
                  role: "system",
                  content:
                    `${supplementalContext}\n\nThis web and document context has already been retrieved for you by the application. Use it when relevant. If the web context is uncertain or conflicting, say so briefly in Farsi instead of overstating certainty. Do not claim that you lack web access when this context is present.`
                }
              ]
            : []),
          ...messages
        ],
        max_tokens: chatConfig.maxTokens,
        temperature: chatConfig.temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: "Could not connect to the model server.",
          details: `${response.status} ${errorText}`.trim()
        },
        { status: response.status >= 500 ? 503 : 500 }
      );
    }

    let payload: TensorRtResponse;
    try {
      payload = (await response.json()) as TensorRtResponse;
    } catch (error) {
      return NextResponse.json({ error: "The model server returned malformed JSON." }, { status: 500 });
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "No assistant content was returned by the model server." }, { status: 500 });
    }

    return NextResponse.json({ content });
  } catch (error) {
    return NextResponse.json({ error: "The local model server is unavailable." }, { status: 503 });
  }
}
